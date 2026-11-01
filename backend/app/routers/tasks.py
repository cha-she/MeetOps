from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import can_edit_meeting_items, can_edit_task, current_user, ensure
from ..serializers import task_out
from ..services import audit, notifications, review

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[schemas.TaskOut])
def list_tasks(
    db: Session = Depends(get_db),
    user: models.User = Depends(current_user),
    status: str | None = None,
    meeting_id: int | None = Query(default=None, alias="meetingId"),
    owner_id: int | None = Query(default=None, alias="ownerId"),
    department_id: int | None = Query(default=None, alias="departmentId"),
    mine: bool = False,
    unassigned: bool = False,
    review_status: str | None = Query(default=None, alias="review"),
    priority: str | None = None,
    q: str | None = None,
    overdue: bool = False,
    due_from: date | None = Query(default=None, alias="dueFrom"),
    due_to: date | None = Query(default=None, alias="dueTo"),
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    sort: str = "created",
    limit: int | None = Query(default=None, ge=1, le=1000),
):
    stmt = select(models.Task).join(models.Task.meeting)
    if review_status in ("suggested", "confirmed", "rejected"):
        stmt = stmt.where(models.Task.review_status == review_status)
    else:
        stmt = stmt.where(models.Task.review_status != "rejected")
    if status:
        stmt = stmt.where(models.Task.status == status)
    if meeting_id:
        stmt = stmt.where(models.Task.meeting_id == meeting_id)
    if mine:
        stmt = stmt.where(models.Task.owner_id == user.id)
    elif owner_id:
        stmt = stmt.where(models.Task.owner_id == owner_id)
    if unassigned:
        stmt = stmt.where(models.Task.owner_id.is_(None))
    if department_id:
        stmt = stmt.where(or_(models.Meeting.department_id == department_id,
                              models.Task.owner.has(models.User.department_id == department_id)))
    if priority:
        stmt = stmt.where(models.Task.priority == priority)
    if q:
        stmt = stmt.where(models.Task.description.ilike(f"%{q}%"))
    if overdue:
        stmt = stmt.where(models.Task.status != "Completed", models.Task.deadline < date.today())
    if due_from:
        stmt = stmt.where(models.Task.deadline >= due_from)
    if due_to:
        stmt = stmt.where(models.Task.deadline <= due_to)
    if date_from:
        stmt = stmt.where(models.Meeting.date >= date_from)
    if date_to:
        stmt = stmt.where(models.Meeting.date <= date_to)
    if sort == "deadline":
        stmt = stmt.order_by(models.Task.deadline.is_(None), models.Task.deadline, models.Task.id)
    elif sort == "priority":
        stmt = stmt.order_by(models.Task.priority.desc(), models.Task.deadline.is_(None), models.Task.deadline)
    else:
        stmt = stmt.order_by(models.Meeting.date.desc(), models.Task.id)
    if limit:
        stmt = stmt.limit(limit)
    return [task_out(t) for t in db.scalars(stmt)]


@router.get("/{task_id}", response_model=schemas.TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db), _: models.User = Depends(current_user)):
    t = db.get(models.Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    return task_out(t)


@router.post("", response_model=schemas.TaskOut, status_code=201)
def create_task(body: schemas.TaskCreate, db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    """Add a task by hand (something the model missed or that came up outside the transcript)."""
    meeting = db.get(models.Meeting, body.meeting_id)
    if not meeting:
        raise HTTPException(422, "Unknown meeting")
    ensure(can_edit_meeting_items(user, meeting), "You can only add tasks to meetings you attended or manage.")
    if body.owner_id and not db.get(models.User, body.owner_id):
        raise HTTPException(422, "Unknown owner")
    if body.segment_id:
        seg = db.get(models.Segment, body.segment_id)
        if not seg or seg.meeting_id != meeting.id:
            raise HTTPException(422, "The evidence line must belong to the same meeting")
    t = models.Task(meeting_id=meeting.id, segment_id=body.segment_id, description=body.description.strip(),
                    owner_id=body.owner_id, deadline=body.deadline, priority=body.priority, status="Open",
                    review_status="confirmed", source="manual", reviewed_by_id=user.id,
                    reviewed_at=datetime.now(timezone.utc))
    db.add(t)
    db.flush()
    if t.owner_id and t.owner_id != user.id:
        notifications.add(db, t.owner_id, "assigned", f"{user.name} assigned you “{t.description}”.",
                          task_id=t.id, meeting_id=meeting.id)
    audit.log(db, "task", t.id, "created", t.description, actor_id=user.id, meeting_id=meeting.id)
    db.commit()
    db.refresh(t)
    return task_out(t)


@router.patch("/{task_id}", response_model=schemas.TaskOut)
def update_task(task_id: int, patch: schemas.TaskPatch, db: Session = Depends(get_db),
                user: models.User = Depends(current_user)):
    t = db.get(models.Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    ensure(can_edit_task(user, t), "Only the task owner, their manager or an administrator can change this task.")
    changes = patch.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(422, "Nothing to update")
    if changes.get("owner_id") is not None and not db.get(models.User, changes["owner_id"]):
        raise HTTPException(422, "Unknown owner")

    review_status = changes.pop("review_status", None)
    before = {k: getattr(t, k) for k in changes}
    for key, value in changes.items():
        setattr(t, key, value)
    if "owner_id" in changes:
        t.owner_name = None   # an explicit choice replaces the name heard in the meeting

    if "status" in changes and before["status"] != t.status:
        t.completed_at = datetime.now(timezone.utc) if t.status == "Completed" else None
        notify = {t.owner_id, t.meeting.uploaded_by_id} - {user.id, None}
        for uid in notify:
            notifications.add(db, uid, "status_change", f"{user.name} moved “{t.description}” to {t.status}.",
                              task_id=t.id, meeting_id=t.meeting_id)
    if "owner_id" in changes and before["owner_id"] != t.owner_id and t.owner_id and t.owner_id != user.id:
        notifications.add(db, t.owner_id, "assigned", f"{user.name} assigned you “{t.description}”.",
                          task_id=t.id, meeting_id=t.meeting_id)
    if changes:
        audit.log(db, "task", t.id, "updated", ", ".join(f"{k}: {before[k]} → {changes[k]}" for k in changes),
                  actor_id=user.id, meeting_id=t.meeting_id)
    if review_status:
        review.set_review(db, t, review_status, user)
    elif changes and t.review_status == "suggested":
        review.set_review(db, t, "confirmed", user)   # editing a suggestion accepts it
    db.commit()
    db.refresh(t)
    return task_out(t)
