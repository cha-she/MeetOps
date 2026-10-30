from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import current_user
from ..serializers import activity_out, decision_out, risk_out, task_out
from ..services import insights

router = APIRouter(tags=["insights"])


@router.get("/insights/summary", response_model=schemas.InsightsSummary)
def summary(db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    return insights.build(db, user)


@router.get("/review", response_model=schemas.ReviewQueue)
def review_queue(db: Session = Depends(get_db), user: models.User = Depends(current_user),
                 meeting_id: int | None = Query(default=None, alias="meetingId"), mine: bool = False):
    """Items the system is not sure about and that wait for a person to confirm or reject."""
    def pending(model):
        stmt = select(model).where(model.review_status == "suggested")
        if meeting_id:
            stmt = stmt.where(model.meeting_id == meeting_id)
        return stmt.order_by(model.meeting_id.desc(), model.id)

    tasks = db.scalars(pending(models.Task)).all()
    if mine:
        tasks = [t for t in tasks if t.owner_id == user.id or t.meeting.uploaded_by_id == user.id]
    return schemas.ReviewQueue(tasks=[task_out(t) for t in tasks],
                               decisions=[decision_out(d) for d in db.scalars(pending(models.Decision))],
                               risks=[risk_out(r) for r in db.scalars(pending(models.Risk))])


@router.get("/activity", response_model=list[schemas.ActivityOut])
def activity(db: Session = Depends(get_db), _: models.User = Depends(current_user),
             meeting_id: int | None = Query(default=None, alias="meetingId"),
             limit: int = Query(default=30, ge=1, le=200)):
    stmt = select(models.AuditLog).order_by(models.AuditLog.created_at.desc(), models.AuditLog.id.desc())
    if meeting_id:
        stmt = stmt.where(models.AuditLog.meeting_id == meeting_id)
    return [activity_out(a) for a in db.scalars(stmt.limit(limit))]
