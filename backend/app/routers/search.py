from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import current_user
from ..serializers import decision_out, meeting_out, risk_out, task_out

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=schemas.SearchResults)
def search(q: str = Query(min_length=1, max_length=200), db: Session = Depends(get_db),
           _: models.User = Depends(current_user)):
    like = f"%{q}%"
    meetings = db.scalars(select(models.Meeting).where(
        or_(models.Meeting.title.ilike(like), models.Meeting.summary.ilike(like))).limit(20)).all()

    tasks = db.scalars(select(models.Task).outerjoin(models.Task.owner).outerjoin(models.Task.segment).where(
        models.Task.review_status != "rejected",
        or_(models.Task.description.ilike(like), models.User.name.ilike(like), models.Segment.text.ilike(like))
    ).limit(30)).all()

    decisions = db.scalars(select(models.Decision).outerjoin(models.Decision.segment).where(
        models.Decision.review_status != "rejected",
        or_(models.Decision.statement.ilike(like), models.Segment.text.ilike(like))).limit(30)).all()

    risks = db.scalars(select(models.Risk).outerjoin(models.Risk.segment).where(
        models.Risk.review_status != "rejected",
        or_(models.Risk.description.ilike(like), models.Segment.text.ilike(like))).limit(30)).all()

    return schemas.SearchResults(
        query=q,
        meetings=[meeting_out(m) for m in meetings],
        tasks=[task_out(t) for t in tasks],
        decisions=[decision_out(d) for d in decisions],
        risks=[risk_out(r) for r in risks],
    )
