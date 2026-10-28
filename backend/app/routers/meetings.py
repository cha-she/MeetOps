from datetime import date
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..serializers import meeting_out, segment_out
from ..services import audit
from ..services.pipeline import process_meeting

router = APIRouter(prefix="/meetings", tags=["meetings"])

SOURCE_BY_EXT = {
    ".txt": "transcript", ".md": "transcript",
    ".mp3": "audio", ".wav": "audio", ".m4a": "audio", ".ogg": "audio",
    ".mp4": "video", ".mkv": "video", ".webm": "video", ".mov": "video",
}


def _get(db: Session, meeting_id: int) -> models.Meeting:
    m = db.get(models.Meeting, meeting_id)
    if not m:
        raise HTTPException(404, "Meeting not found")
    return m


@router.get("", response_model=list[schemas.MeetingOut])
def list_meetings(db: Session = Depends(get_db), q: str | None = None,
                  limit: int | None = Query(default=None, ge=1, le=500)):
    stmt = select(models.Meeting).order_by(models.Meeting.date.desc(), models.Meeting.id.desc())
    if q:
        stmt = stmt.where(models.Meeting.title.ilike(f"%{q}%"))
    if limit:
        stmt = stmt.limit(limit)
    return [meeting_out(m) for m in db.scalars(stmt)]


@router.get("/{meeting_id}", response_model=schemas.MeetingOut)
def get_meeting(meeting_id: int, db: Session = Depends(get_db)):
    return meeting_out(_get(db, meeting_id))


@router.get("/{meeting_id}/segments", response_model=list[schemas.SegmentOut])
def get_segments(meeting_id: int, db: Session = Depends(get_db)):
    return [segment_out(s) for s in _get(db, meeting_id).segments]


@router.post("/upload", response_model=schemas.MeetingOut, status_code=201)
async def upload_meeting(
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    title: str = Form(..., min_length=1, max_length=200),
    date_: date = Form(..., alias="date"),
):
    ext = Path(file.filename or "").suffix.lower()
    source = SOURCE_BY_EXT.get(ext)
    if not source:
        raise HTTPException(415, f"Unsupported file type '{ext or 'none'}'. Upload a .txt transcript or an audio/video file.")

    data = await file.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File larger than {settings.max_upload_mb} MB")

    meeting = models.Meeting(title=title.strip(), date=date_, source=source, status="Queued",
                             pipeline_stage="upload", file_name=file.filename)
    db.add(meeting)
    db.flush()

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    stored = settings.upload_dir / f"{meeting.id}{ext}"
    stored.write_bytes(data)

    audit.log(db, "meeting", meeting.id, "created", f"uploaded {file.filename} ({len(data)} bytes)")
    db.commit()
    db.refresh(meeting)

    transcript = data.decode("utf-8", errors="replace") if source == "transcript" else None
    background.add_task(process_meeting, meeting.id, transcript)
    return meeting_out(meeting)


@router.delete("/{meeting_id}", status_code=204)
def delete_meeting(meeting_id: int, db: Session = Depends(get_db)):
    m = _get(db, meeting_id)
    audit.log(db, "meeting", m.id, "deleted", m.title)
    db.delete(m)
    db.commit()
    return Response(status_code=204)
