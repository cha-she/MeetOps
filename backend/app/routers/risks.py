from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..serializers import risk_out

router = APIRouter(prefix="/risks", tags=["risks"])


@router.get("", response_model=list[schemas.RiskOut])
def list_risks(
    db: Session = Depends(get_db),
    meeting_id: int | None = Query(default=None, alias="meetingId"),
    severity: str | None = None,
    q: str | None = None,
):
    stmt = select(models.Risk)
    if meeting_id:
        stmt = stmt.where(models.Risk.meeting_id == meeting_id)
    if severity:
        stmt = stmt.where(models.Risk.severity == severity)
    if q:
        stmt = stmt.where(models.Risk.description.ilike(f"%{q}%"))
    stmt = stmt.order_by(models.Risk.raised_at.desc(), models.Risk.id.desc())
    return [risk_out(r) for r in db.scalars(stmt)]
