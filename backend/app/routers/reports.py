import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import current_user
from ..services import audit, reports

router = APIRouter(tags=["reports"])

MODELS = {"tasks": models.Task, "decisions": models.Decision, "risks": models.Risk}


def _pdf(content: bytes, name: str) -> Response:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-") or "report"
    return Response(content, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{safe}.pdf"'})


@router.get("/meetings/{meeting_id}/report.pdf")
def meeting_report(meeting_id: int, db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    """Minutes of one meeting as a PDF."""
    m = db.get(models.Meeting, meeting_id)
    if not m:
        raise HTTPException(404, "Meeting not found")
    audit.log(db, "meeting", m.id, "exported", "minutes PDF", actor_id=user.id, meeting_id=m.id)
    db.commit()
    return _pdf(reports.meeting_minutes(m), f"MeetOps-minutes-{m.date}-{m.title}")


@router.post("/reports/{kind}")
def register_report(kind: Literal["tasks", "decisions", "risks"], body: schemas.ReportRequest,
                    db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    """The Tasks, Decisions or Risks register as a PDF, for the rows the page shows (in that order)."""
    model = MODELS[kind]
    found = {i.id: i for i in db.scalars(select(model).where(model.id.in_(body.ids))).all()}
    items = [found[i] for i in body.ids if i in found]
    audit.log(db, kind[:-1], 0, "exported", f"{len(items)} rows to PDF", actor_id=user.id)   # 0 = a whole register
    db.commit()
    return _pdf(reports.register(kind, items, body.title), f"MeetOps-{kind}")
