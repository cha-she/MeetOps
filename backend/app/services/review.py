"""
Human review of extracted items, and corrections of the classifier.

* ``set_review`` confirms or rejects a task / decision / risk. A rejection is
  also stored as label feedback ("the model said Task, a person says Other").
* ``reclassify_segment`` lets a person mark any transcript line as Task,
  Decision, Risk or Other. The item linked to that line is replaced by one of
  the new type (confirmed, because a person chose it) and the correction is
  stored as label feedback.
* ``rename_speaker`` replaces a speaker label from a recording ("Speaker 2")
  with the person's name throughout the meeting.

The ``label_feedback`` table is the training data for the next model version.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .. import models
from . import audit, extraction

KIND_OF = {models.Task: "Task", models.Decision: "Decision", models.Risk: "Risk"}


def set_review(db: Session, item, status: str, user: models.User) -> None:
    if item.review_status == status:
        return
    kind = KIND_OF[type(item)]
    item.review_status = status
    item.reviewed_at = datetime.now(timezone.utc)
    item.reviewed_by_id = user.id
    if status == "rejected" and item.source == "ai" and item.segment is not None:
        db.add(models.LabelFeedback(segment_id=item.segment_id, text=item.segment.text, predicted=kind,
                                    corrected="Other", user_id=user.id))
        others = [i for i in (*_items_for(db, item.segment_id),) if i is not item and i.review_status != "rejected"]
        if not others:
            item.segment.category = "Other"
            item.segment.corrected = True
    audit.log(db, kind.lower(), item.id, status, None, actor_id=user.id, meeting_id=item.meeting_id)


def _items_for(db: Session, segment_id: int | None):
    if segment_id is None:
        return []
    out = []
    for model in (models.Task, models.Decision, models.Risk):
        out += db.scalars(select(model).where(model.segment_id == segment_id)).all()
    return out


def reclassify_segment(db: Session, seg: models.Segment, category: str, user: models.User):
    """Return the new item (or None for Other)."""
    before = seg.category
    for model in (models.Task, models.Decision, models.Risk):
        db.execute(delete(model).where(model.segment_id == seg.id))
    db.add(models.LabelFeedback(segment_id=seg.id, text=seg.text, predicted=before, corrected=category,
                                user_id=user.id))
    seg.category = category
    seg.corrected = True

    meeting = seg.meeting
    users = db.scalars(select(models.User).where(models.User.is_active.is_(True))).all()
    now = datetime.now(timezone.utc)
    common = dict(meeting_id=meeting.id, segment_id=seg.id, review_status="confirmed", source="manual",
                  confidence=None, reviewed_at=now)
    item = None
    if category == "Task":
        f = extraction.task_fields(seg.text, seg.speaker, meeting.date, users)
        speakers = {s.speaker for s in meeting.segments if s.speaker}
        owner_user, owner_name = extraction.find_owner_name(seg.text, seg.speaker, users, speakers)
        item = models.Task(description=extraction.task_title(seg.text, users) or extraction.tidy(seg.text),
                           owner_id=owner_user.id if owner_user else None, owner_name=owner_name, deadline=f.deadline,
                           deadline_time=extraction.deadline_time(f.deadline_text) if f.deadline else None,
                           deadline_text=f.deadline_text, status="Open", reviewed_by_id=user.id, **common)
    elif category == "Decision":
        owner = extraction.match_user(seg.speaker, users)
        item = models.Decision(statement=extraction.tidy(seg.text), owner_id=owner.id if owner else None,
                               owner_name=owner.name if owner else (seg.speaker if seg.speaker != "Unknown" else None),
                               decided_at=meeting.date, reviewed_by_id=user.id, **common)
    elif category == "Risk":
        item = models.Risk(description=extraction.tidy(seg.text), severity=extraction.risk_severity(seg.text),
                           raised_at=meeting.date, raised_by=seg.speaker, reviewed_by_id=user.id, **common)
    if item is not None:
        db.add(item)
    audit.log(db, "segment", seg.id, "reclassified", f"{before} -> {category}: {seg.text[:80]}",
              actor_id=user.id, meeting_id=meeting.id)
    return item


def rename_speaker(db: Session, meeting: models.Meeting, speaker: str, name: str, user: models.User) -> int:
    """Give a speaker label a real name in the transcript, task and decision owners and risks.

    When the name matches an account, items owned by that speaker are assigned to the account and
    the person becomes a participant. Returns the number of transcript lines changed.
    """
    users = db.scalars(select(models.User).where(models.User.is_active.is_(True))).all()
    account = extraction.match_user(name.strip(), users)
    name = account.name if account else name.strip()
    if name == speaker:
        return 0
    lines = 0
    for s in meeting.segments:
        if s.speaker == speaker:
            s.speaker = name
            lines += 1
    for item in [*meeting.tasks, *meeting.decisions]:
        if item.owner_name == speaker:
            item.owner_name = name
            if account and item.owner_id is None:
                item.owner_id = account.id
    for r in meeting.risks:
        if r.raised_by == speaker:
            r.raised_by = name
    if account and account not in meeting.participants:
        meeting.participants.append(account)
    if lines:
        audit.log(db, "meeting", meeting.id, "speaker renamed", f"{speaker} -> {name}",
                  actor_id=user.id, meeting_id=meeting.id)
    return lines


def manual_item_context(db: Session, meeting_id: int, owner_id: int | None, segment_id: int | None,
                        user: models.User, kind: str) -> tuple[models.Meeting, models.Segment | None]:
    """Checks for a task, decision or risk added by hand: the meeting, the owner and the evidence line."""
    from fastapi import HTTPException

    from ..security import can_edit_meeting_items, ensure

    meeting = db.get(models.Meeting, meeting_id)
    if not meeting:
        raise HTTPException(422, "Unknown meeting")
    ensure(can_edit_meeting_items(user, meeting), f"You can only add {kind} to meetings you attended or manage.")
    if owner_id and not db.get(models.User, owner_id):
        raise HTTPException(422, "Unknown owner")
    seg = None
    if segment_id:
        seg = db.get(models.Segment, segment_id)
        if not seg or seg.meeting_id != meeting.id:
            raise HTTPException(422, "The evidence line must belong to the same meeting")
    return meeting, seg
