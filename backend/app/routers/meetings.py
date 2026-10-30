from datetime import date
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..security import can_delete_meeting, can_edit_meeting_items, current_user, ensure
from ..serializers import meeting_out, segment_out
from ..services import audit, review
from ..services.pipeline import process_meeting

router = APIRouter(tags=["meetings"])

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


@router.get("/meetings", response_model=list[schemas.MeetingOut])
def list_meetings(
    db: Session = Depends(get_db), _: models.User = Depends(current_user),
    q: str | None = None,
    department_id: int | None = Query(default=None, alias="departmentId"),
    participant_id: int | None = Query(default=None, alias="participantId"),
    status: str | None = None,
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    limit: int | None = Query(default=None, ge=1, le=500),
):
    stmt = select(models.Meeting).order_by(models.Meeting.date.desc(), models.Meeting.id.desc())
    if q:
        stmt = stmt.where(models.Meeting.title.ilike(f"%{q}%"))
    if department_id:
        stmt = stmt.where(models.Meeting.department_id == department_id)
    if participant_id:
        stmt = stmt.where(models.Meeting.participants.any(models.User.id == participant_id))
    if status:
        stmt = stmt.where(models.Meeting.status == status)
    if date_from:
        stmt = stmt.where(models.Meeting.date >= date_from)
    if date_to:
        stmt = stmt.where(models.Meeting.date <= date_to)
    if limit:
        stmt = stmt.limit(limit)
    return [meeting_out(m) for m in db.scalars(stmt)]


@router.get("/meetings/{meeting_id}", response_model=schemas.MeetingOut)
def get_meeting(meeting_id: int, db: Session = Depends(get_db), _: models.User = Depends(current_user)):
    return meeting_out(_get(db, meeting_id))


@router.get("/meetings/{meeting_id}/segments", response_model=list[schemas.SegmentOut])
def get_segments(meeting_id: int, db: Session = Depends(get_db), _: models.User = Depends(current_user)):
    return [segment_out(s) for s in _get(db, meeting_id).segments]


@router.post("/meetings/upload", response_model=schemas.MeetingOut, status_code=201)
async def upload_meeting(
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: models.User = Depends(current_user),
    file: UploadFile = File(...),
    title: str = Form(..., min_length=1, max_length=200),
    date_: date = Form(..., alias="date"),
    department_id: int | None = Form(default=None, alias="departmentId"),
):
    ext = Path(file.filename or "").suffix.lower()
    source = SOURCE_BY_EXT.get(ext)
    if not source:
        raise HTTPException(415, f"Unsupported file type '{ext or 'none'}'. Upload a .txt transcript or an audio/video file.")

    data = await file.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File larger than {settings.max_upload_mb} MB")
    if department_id and not db.get(models.Department, department_id):
        raise HTTPException(422, "Unknown department")

    meeting = models.Meeting(title=title.strip(), date=date_, source=source, status="Queued",
                             pipeline_stage="upload", file_name=file.filename,
                             department_id=department_id or user.department_id, uploaded_by_id=user.id)
    db.add(meeting)
    db.flush()

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    (settings.upload_dir / f"{meeting.id}{ext}").write_bytes(data)

    audit.log(db, "meeting", meeting.id, "created", f"uploaded {file.filename} ({len(data)} bytes)",
              actor_id=user.id, meeting_id=meeting.id)
    db.commit()
    db.refresh(meeting)

    transcript = data.decode("utf-8", errors="replace") if source == "transcript" else None
    background.add_task(process_meeting, meeting.id, transcript)
    return meeting_out(meeting)


@router.delete("/meetings/{meeting_id}", status_code=204)
def delete_meeting(meeting_id: int, db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    m = _get(db, meeting_id)
    ensure(can_delete_meeting(user, m), "Only an administrator, the department manager or the uploader can delete this meeting.")
    audit.log(db, "meeting", m.id, "deleted", m.title, actor_id=user.id)
    db.delete(m)
    db.commit()
    return Response(status_code=204)


@router.post("/segments/{segment_id}/category", response_model=schemas.SegmentOut)
def reclassify(segment_id: int, body: schemas.ReclassifyIn, db: Session = Depends(get_db),
               user: models.User = Depends(current_user)):
    """Correct the label of one transcript line; creates or removes the matching register entry."""
    seg = db.get(models.Segment, segment_id)
    if not seg:
        raise HTTPException(404, "Segment not found")
    ensure(can_edit_meeting_items(user, seg.meeting))
    review.reclassify_segment(db, seg, body.category, user)
    db.commit()
    db.refresh(seg)
    return segment_out(seg)
