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
from ..services import audit, review, speakers
from ..services.pipeline import process_meeting

router = APIRouter(tags=["meetings"])

SOURCE_BY_EXT = {
    ".txt": "transcript", ".md": "transcript", ".vtt": "transcript", ".srt": "transcript",
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


@router.get("/meetings/{meeting_id}/speakers", response_model=list[schemas.SpeakerOut])
def list_speakers(meeting_id: int, db: Session = Depends(get_db), _: models.User = Depends(current_user)):
    """Numbered speakers of a recording, each with a sample line and a name suggestion from the conversation."""
    m = _get(db, meeting_id)
    users = db.scalars(select(models.User).where(models.User.is_active.is_(True))).all()
    hints = speakers.suggest_names(m.segments, users)
    out: dict[str, schemas.SpeakerOut] = {}
    for s in m.segments:
        if not speakers.is_speaker_number(s.speaker):
            continue
        cur = out.get(s.speaker)
        if cur is None:
            name, heard = hints.get(s.speaker, (None, None))
            cur = out[s.speaker] = schemas.SpeakerOut(speaker=s.speaker, lines=0, sample="", suggestion=name, heard_in=heard)
        cur.lines += 1
        if len(cur.sample) < len(s.text) < 140:
            cur.sample = s.text
    return list(out.values())


@router.post("/meetings/{meeting_id}/speakers", response_model=schemas.MeetingOut)
def rename_speaker(meeting_id: int, body: schemas.SpeakerRename, db: Session = Depends(get_db),
                   user: models.User = Depends(current_user)):
    """Name a speaker from a recording ("Speaker 2" -> "Nethmi Fernando") throughout the meeting."""
    m = _get(db, meeting_id)
    ensure(can_edit_meeting_items(user, m))
    if not review.rename_speaker(db, m, body.speaker, body.name, user):
        raise HTTPException(422, f"No transcript line is spoken by '{body.speaker}'")
    db.commit()
    db.refresh(m)
    return meeting_out(m)


@router.post("/meetings/upload", response_model=schemas.MeetingOut, status_code=201)
async def upload_meeting(
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: models.User = Depends(current_user),
    file: UploadFile = File(...),
    title: str = Form(..., min_length=1, max_length=200),
    date_: date = Form(..., alias="date"),
    department_id: int | None = Form(default=None, alias="departmentId"),
    num_speakers: int | None = Form(default=None, alias="speakers", ge=1, le=20),
):
    ext = Path(file.filename or "").suffix.lower()
    source = SOURCE_BY_EXT.get(ext)
    if not source:
        raise HTTPException(415, f"Unsupported file type '{ext or 'none'}'. Upload a transcript (.txt, .md, .vtt, .srt) or an audio/video file.")
    if department_id and not db.get(models.Department, department_id):
        raise HTTPException(422, "Unknown department")
    limit_mb = settings.max_upload_mb if source == "transcript" else settings.max_media_mb

    meeting = models.Meeting(title=title.strip(), date=date_, source=source, status="Queued",
                             pipeline_stage="upload", file_name=file.filename,
                             num_speakers=num_speakers if source != "transcript" else None,
                             department_id=department_id or user.department_id, uploaded_by_id=user.id)
    db.add(meeting)
    db.flush()

    # written in chunks: a recording can be hundreds of megabytes
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    path = settings.upload_dir / f"{meeting.id}{ext}"
    size = 0
    with path.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > limit_mb * 1024 * 1024:
                out.close()
                path.unlink(missing_ok=True)
                db.rollback()
                raise HTTPException(413, f"File larger than {limit_mb} MB")
            out.write(chunk)

    audit.log(db, "meeting", meeting.id, "created", f"uploaded {file.filename} ({size} bytes)",
              actor_id=user.id, meeting_id=meeting.id)
    db.commit()
    db.refresh(meeting)

    if source == "transcript":
        background.add_task(process_meeting, meeting.id, path.read_text(encoding="utf-8", errors="replace"))
    else:
        background.add_task(process_meeting, meeting.id, None, path)
    return meeting_out(meeting)


@router.delete("/meetings/{meeting_id}", status_code=204)
def delete_meeting(meeting_id: int, db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    m = _get(db, meeting_id)
    ensure(can_delete_meeting(user, m), "Only an administrator, the department manager or the uploader can delete this meeting.")
    audit.log(db, "meeting", m.id, "deleted", m.title, actor_id=user.id)
    db.delete(m)
    db.commit()
    return Response(status_code=204)
