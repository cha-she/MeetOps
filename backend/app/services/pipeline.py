"""
Meeting processing pipeline.

    upload -> transcribe -> preprocess -> classify -> extract -> save

Runs in a background task after the upload request returns, updating
``meeting.pipeline_stage`` as it goes so the dashboard can show progress.
Audio/video transcription (Whisper) is scheduled for semester 2; for now
those uploads stop at the transcribe stage with a clear message.
"""

from __future__ import annotations

import logging
import time

from meetops_ml.preprocessing import segment_transcript
from sqlalchemy import select

from .. import models
from ..config import settings
from ..database import SessionLocal
from . import audit, extraction, summary
from .classifier import get_classifier

log = logging.getLogger("meetops.pipeline")

STAGES = ("upload", "transcribe", "preprocess", "classify", "extract", "save")


def _set_stage(db, meeting: models.Meeting, stage: str) -> None:
    meeting.status = "Processing"
    meeting.pipeline_stage = stage
    db.commit()
    if settings.pipeline_stage_delay:
        time.sleep(settings.pipeline_stage_delay)


def process_meeting(meeting_id: int, transcript_text: str | None) -> None:
    db = SessionLocal()
    try:
        meeting = db.get(models.Meeting, meeting_id)
        if not meeting:
            return
        try:
            _run(db, meeting, transcript_text)
        except Exception as exc:  # noqa: BLE001 - any failure is recorded on the meeting
            log.exception("pipeline failed for meeting %s", meeting_id)
            db.rollback()
            meeting = db.get(models.Meeting, meeting_id)
            meeting.status = "Failed"
            meeting.error_message = str(exc)[:500]
            audit.log(db, "meeting", meeting.id, "failed", meeting.error_message)
            db.commit()
    finally:
        db.close()


def _run(db, meeting: models.Meeting, transcript_text: str | None) -> None:
    users = db.scalars(select(models.User)).all()

    _set_stage(db, meeting, "transcribe")
    if meeting.source != "transcript":
        raise RuntimeError("Audio and video transcription (Whisper) is planned for the next phase. "
                           "Upload a text transcript (.txt) with 'Speaker: text' lines for now.")
    if not transcript_text or not transcript_text.strip():
        raise RuntimeError("The transcript file is empty.")

    _set_stage(db, meeting, "preprocess")
    utterances = segment_transcript(transcript_text)
    if not utterances:
        raise RuntimeError("No utterances found. Use one line per turn in the form 'Speaker: text'.")

    _set_stage(db, meeting, "classify")
    clf = get_classifier()
    preds = clf.predict([u.text for u in utterances])

    segments = []
    for pos, (u, p) in enumerate(zip(utterances, preds)):
        seg = models.Segment(meeting_id=meeting.id, position=pos, speaker=u.speaker, start_sec=u.start_time,
                             text=u.text, category=p.label, confidence=p.confidence)
        db.add(seg)
        segments.append(seg)
    db.flush()

    # Participants = speakers that match a known user
    speakers = {u.speaker for u in utterances if u.speaker and u.speaker != "Unknown"}
    meeting.participants = [m for m in (extraction.match_user(s, users) for s in speakers) if m]

    _set_stage(db, meeting, "extract")
    new_risks: list[models.Risk] = []
    for seg in segments:
        if seg.category == "Task":
            f = extraction.task_fields(seg.text, seg.speaker, meeting.date, users)
            db.add(models.Task(meeting_id=meeting.id, segment_id=seg.id, description=extraction.tidy(seg.text),
                               owner_id=f.owner.id if f.owner else None, deadline=f.deadline, status="Open"))
        elif seg.category == "Decision":
            owner = extraction.match_user(seg.speaker, users)
            db.add(models.Decision(meeting_id=meeting.id, segment_id=seg.id, statement=extraction.tidy(seg.text),
                                   owner_id=owner.id if owner else None, decided_at=meeting.date))
        elif seg.category == "Risk":
            r = models.Risk(meeting_id=meeting.id, segment_id=seg.id, description=extraction.tidy(seg.text),
                            severity=extraction.risk_severity(seg.text), raised_at=meeting.date)
            db.add(r)
            new_risks.append(r)
    db.flush()

    # Recurring risks: similar to a risk raised in an earlier meeting
    old = db.scalars(select(models.Risk).where(models.Risk.meeting_id != meeting.id)).all()
    for i, j in summary.recurring_pairs([r.description for r in new_risks], [r.description for r in old]):
        new_risks[i].recurring = True
        old[j].recurring = True

    _set_stage(db, meeting, "save")
    meeting.summary = summary.extractive_summary([(s.text, s.category) for s in segments])
    if meeting.duration_min is None:
        times = [u.start_time for u in utterances if u.start_time is not None]
        meeting.duration_min = int(max(times) // 60) + 1 if times else None
    meeting.status = "Processed"
    meeting.pipeline_stage = None
    meeting.error_message = None
    audit.log(db, "meeting", meeting.id, "processed",
              f"{len(segments)} segments, {sum(s.category == 'Task' for s in segments)} tasks, "
              f"{sum(s.category == 'Decision' for s in segments)} decisions, {len(new_risks)} risks ({clf.name})")
    db.commit()
