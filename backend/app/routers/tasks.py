from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..serializers import task_out
from ..services import audit, notifications

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[schemas.TaskOut])
def list_tasks(
    db: Session = Depends(get_db),
    status: str | None = None,
    meeting_id: int | None = Query(default=None, alias="meetingId"),
    owner_id: int | None = Query(default=None, alias="ownerId"),
    q: str | None = None,
    overdue: bool = False,
    sort: str = "created",
    limit: int | None = Query(default=None, ge=1, le=500),
):
    stmt = select(models.Task)
    if status:
        stmt = stmt.where(models.Task.status == status)
    if meeting_id:
        stmt = stmt.where(models.Task.meeting_id == meeting_id)
    if owner_id:
        stmt = stmt.where(models.Task.owner_id == owner_id)
    if q:
        stmt = stmt.where(models.Task.description.ilike(f"%{q}%"))
    if overdue:
        stmt = stmt.where(models.Task.status != "Completed", models.Task.deadline < date.today())
    if sort == "deadline":
        stmt = stmt.order_by(models.Task.deadline.is_(None), models.Task.deadline, models.Task.id)
    else:
        stmt = stmt.order_by(models.Task.created_at.desc(), models.Task.id.desc())
    if limit:
        stmt = stmt.limit(limit)
    return [task_out(t) for t in db.scalars(stmt)]


@router.get("/{task_id}", response_model=schemas.TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db)):
    t = db.get(models.Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    return task_out(t)


@router.patch("/{task_id}", response_model=schemas.TaskOut)
def update_task(task_id: int, patch: schemas.TaskPatch, db: Session = Depends(get_db)):
    t = db.get(models.Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    changes = patch.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(422, "Nothing to update")

    if "owner_id" in changes and changes["owner_id"] is not None and not db.get(models.User, changes["owner_id"]):
        raise HTTPException(422, "Unknown owner")

    before = {k: getattr(t, k) for k in changes}
    for key, value in changes.items():
        setattr(t, key, value)

    if "status" in changes and before["status"] != t.status:
        notifications.add(db, "status_change", f"“{t.description}” moved to {t.status}.", t.id)
    if "owner_id" in changes and before["owner_id"] != t.owner_id and t.owner_id:
        db.flush()
        notifications.add(db, "assigned", f"{t.owner.name} was assigned “{t.description}”.", t.id)

    audit.log(db, "task", t.id, "updated",
              ", ".join(f"{k}: {before[k]} -> {changes[k]}" for k in changes))
    db.commit()
    db.refresh(t)
    return task_out(t)
