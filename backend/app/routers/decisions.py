from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import can_edit_meeting_items, current_user, ensure
from ..serializers import decision_out
from ..services import audit, review

router = APIRouter(prefix="/decisions", tags=["decisions"])


@router.get("", response_model=list[schemas.DecisionOut])
def list_decisions(
    db: Session = Depends(get_db),
    _: models.User = Depends(current_user),
    meeting_id: int | None = Query(default=None, alias="meetingId"),
    owner_id: int | None = Query(default=None, alias="ownerId"),
    department_id: int | None = Query(default=None, alias="departmentId"),
    review_status: str | None = Query(default=None, alias="review"),
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    q: str | None = None,
):
    stmt = select(models.Decision).join(models.Decision.meeting)
    if review_status in ("suggested", "confirmed", "rejected"):
        stmt = stmt.where(models.Decision.review_status == review_status)
    else:
        stmt = stmt.where(models.Decision.review_status != "rejected")
    if meeting_id:
        stmt = stmt.where(models.Decision.meeting_id == meeting_id)
    if owner_id:
        stmt = stmt.where(models.Decision.owner_id == owner_id)
    if department_id:
        stmt = stmt.where(models.Meeting.department_id == department_id)
    if date_from:
        stmt = stmt.where(models.Decision.decided_at >= date_from)
    if date_to:
        stmt = stmt.where(models.Decision.decided_at <= date_to)
    if q:
        stmt = stmt.where(models.Decision.statement.ilike(f"%{q}%"))
    stmt = stmt.order_by(models.Decision.decided_at.desc(), models.Decision.id)
    return [decision_out(d) for d in db.scalars(stmt)]


@router.patch("/{decision_id}", response_model=schemas.DecisionOut)
def update_decision(decision_id: int, patch: schemas.DecisionPatch, db: Session = Depends(get_db),
                    user: models.User = Depends(current_user)):
    d = db.get(models.Decision, decision_id)
    if not d:
        raise HTTPException(404, "Decision not found")
    ensure(can_edit_meeting_items(user, d.meeting))
    changes = patch.model_dump(exclude_unset=True)
    review_status = changes.pop("review_status", None)
    if changes.get("owner_id") is not None and not db.get(models.User, changes["owner_id"]):
        raise HTTPException(422, "Unknown owner")
    for k, v in changes.items():
        setattr(d, k, v)
    if changes:
        audit.log(db, "decision", d.id, "updated", ", ".join(changes), actor_id=user.id, meeting_id=d.meeting_id)
    if review_status:
        review.set_review(db, d, review_status, user)
    elif changes and d.review_status == "suggested":
        review.set_review(db, d, "confirmed", user)
    db.commit()
    db.refresh(d)
    return decision_out(d)
