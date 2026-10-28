from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..services import insights

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/summary", response_model=schemas.InsightsSummary)
def summary(db: Session = Depends(get_db)):
    return insights.build(db)
