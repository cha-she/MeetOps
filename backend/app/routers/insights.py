from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import current_user
from ..serializers import activity_out, decision_out, risk_out, task_out
from ..services import clustering, insights

router = APIRouter(tags=["insights"])


@router.get("/insights/summary", response_model=schemas.InsightsSummary)
def summary(db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    return insights.build(db, user)


@router.get("/insights/risk-themes", response_model=schemas.RiskThemes)
def risk_themes(db: Session = Depends(get_db), _: models.User = Depends(current_user),
                department_id: int | None = Query(default=None, alias="departmentId")):
    """All risks (not rejected) grouped into themes by meaning, largest theme first."""
    stmt = select(models.Risk).where(models.Risk.review_status != "rejected").order_by(models.Risk.id)
    if department_id:
        stmt = stmt.join(models.Meeting).where(models.Meeting.department_id == department_id)
    risks = db.scalars(stmt).all()
    groups, score = clustering.group([r.description for r in risks])
    themes = []
    for g in groups:
        members = sorted((risks[i] for i in g.members), key=lambda r: (r.raised_at or r.meeting.date), reverse=True)
        dates = [r.raised_at or r.meeting.date for r in members]
        themes.append(schemas.RiskTheme(
            label=" · ".join(g.keywords) or "other risks", keywords=g.keywords, risk_count=len(members),
            meeting_count=len({r.meeting_id for r in members}),
            open_count=sum(r.status == "Open" for r in members),
            high_count=sum(r.severity == "High" for r in members),
            first_raised=min(dates) if dates else None, last_raised=max(dates) if dates else None,
            risks=[schemas.ThemeRisk(id=r.id, description=r.description, severity=r.severity, status=r.status,
                                     meeting_id=r.meeting_id, meeting_title=r.meeting.title,
                                     raised_at=r.raised_at or r.meeting.date) for r in members]))
    return schemas.RiskThemes(method=clustering.method() if risks else "", silhouette=score,
                              total_risks=len(risks), themes=themes)


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
