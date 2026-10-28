from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..serializers import decision_out

router = APIRouter(prefix="/decisions", tags=["decisions"])


@router.get("", response_model=list[schemas.DecisionOut])
def list_decisions(
    db: Session = Depends(get_db),
    meeting_id: int | None = Query(default=None, alias="meetingId"),
    q: str | None = None,
):
    stmt = select(models.Decision)
    if meeting_id:
        stmt = stmt.where(models.Decision.meeting_id == meeting_id)
    if q:
        stmt = stmt.where(models.Decision.statement.ilike(f"%{q}%"))
    stmt = stmt.order_by(models.Decision.decided_at.desc(), models.Decision.id.desc())
    return [decision_out(d) for d in db.scalars(stmt)]
