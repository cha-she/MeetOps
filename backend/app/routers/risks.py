from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import can_edit_meeting_items, current_user, ensure
from ..serializers import risk_out
from ..services import audit, notifications, review

router = APIRouter(prefix="/risks", tags=["risks"])


@router.get("", response_model=list[schemas.RiskOut])
def list_risks(
    db: Session = Depends(get_db),
    _: models.User = Depends(current_user),
    meeting_id: int | None = Query(default=None, alias="meetingId"),
    severity: str | None = None,
    status: str | None = None,
    owner_id: int | None = Query(default=None, alias="ownerId"),
    department_id: int | None = Query(default=None, alias="departmentId"),
    recurring: bool | None = None,
    review_status: str | None = Query(default=None, alias="review"),
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    q: str | None = None,
):
    stmt = select(models.Risk).join(models.Risk.meeting)
    if review_status in ("suggested", "confirmed", "rejected"):
        stmt = stmt.where(models.Risk.review_status == review_status)
    else:
        stmt = stmt.where(models.Risk.review_status != "rejected")
    if meeting_id:
        stmt = stmt.where(models.Risk.meeting_id == meeting_id)
    if severity:
        stmt = stmt.where(models.Risk.severity == severity)
    if status:
        stmt = stmt.where(models.Risk.status == status)
    if owner_id:
        stmt = stmt.where(models.Risk.owner_id == owner_id)
    if department_id:
        stmt = stmt.where(models.Meeting.department_id == department_id)
    if recurring is not None:
        stmt = stmt.where(models.Risk.recurring.is_(recurring))
    if date_from:
        stmt = stmt.where(models.Risk.raised_at >= date_from)
    if date_to:
        stmt = stmt.where(models.Risk.raised_at <= date_to)
    if q:
        stmt = stmt.where(models.Risk.description.ilike(f"%{q}%"))
    stmt = stmt.order_by(models.Risk.raised_at.desc(), models.Risk.id)
    return [risk_out(r) for r in db.scalars(stmt)]


@router.patch("/{risk_id}", response_model=schemas.RiskOut)
def update_risk(risk_id: int, patch: schemas.RiskPatch, db: Session = Depends(get_db),
                user: models.User = Depends(current_user)):
    r = db.get(models.Risk, risk_id)
    if not r:
        raise HTTPException(404, "Risk not found")
    ensure(can_edit_meeting_items(user, r.meeting) or r.owner_id == user.id)
    changes = patch.model_dump(exclude_unset=True)
    review_status = changes.pop("review_status", None)
    if changes.get("owner_id") is not None and not db.get(models.User, changes["owner_id"]):
        raise HTTPException(422, "Unknown owner")
    before_owner = r.owner_id
    for k, v in changes.items():
        setattr(r, k, v)
    if "owner_id" in changes and r.owner_id and r.owner_id != before_owner and r.owner_id != user.id:
        notifications.add(db, r.owner_id, "assigned", f"{user.name} made you owner of the risk “{r.description}”.",
                          meeting_id=r.meeting_id)
    if changes:
        audit.log(db, "risk", r.id, "updated", ", ".join(changes), actor_id=user.id, meeting_id=r.meeting_id)
    if review_status:
        review.set_review(db, r, review_status, user)
    elif changes and r.review_status == "suggested":
        review.set_review(db, r, "confirmed", user)
    db.commit()
    db.refresh(r)
    return risk_out(r)
