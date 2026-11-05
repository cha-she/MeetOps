"""
Human review of extracted items, and corrections of the classifier.

* ``set_review`` confirms or rejects a task / decision / risk. A rejection is
  also stored as label feedback ("the model said Task, a person says Other").
* ``label_from_manual_item``: a task, decision or risk added by hand from a
  transcript line is stored as label feedback for that line. To change a type,
  a person rejects the extracted item and adds the right one from the line.
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
    if item.source == "ai" and item.segment is not None:
        # every decision on an extracted item is a checked label for retraining (export_feedback.py):
        # confirmed = the label was right, rejected = the line is Other; undo removes it again
        db.execute(delete(models.LabelFeedback).where(models.LabelFeedback.segment_id == item.segment_id,
                                                      models.LabelFeedback.predicted == kind))
        if status in ("confirmed", "rejected"):
            db.add(models.LabelFeedback(segment_id=item.segment_id, text=item.segment.text, predicted=kind,
                                        corrected=kind if status == "confirmed" else "Other", user_id=user.id))
    if status == "rejected" and item.source == "ai" and item.segment is not None:
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


def label_from_manual_item(db: Session, seg: models.Segment, kind: str, user: models.User) -> None:
    """A person added a task, decision or risk from a transcript line: that line is a ``kind``.

    This is how a wrong type is fixed: reject the extracted item (stored as "the model's label
    -> Other"), then add the right item from the same line (stored as "the model's label -> kind";
    the export keeps the latest decision on a sentence). A line the model missed (Other -> Task)
    becomes training data the same way. Changing the type in place was removed, so every
    correction goes through a rejection or an added item and is recorded."""
    predicted = seg.model_label or seg.category
    db.add(models.LabelFeedback(segment_id=seg.id, text=seg.text, predicted=predicted, corrected=kind,
                                user_id=user.id))
    before = seg.category
    seg.category = kind
    seg.corrected = True
    audit.log(db, "segment", seg.id, "labelled", f"{before} -> {kind} (added by hand): {seg.text[:80]}",
              actor_id=user.id, meeting_id=seg.meeting_id)


def evidence_line(db: Session, segment_id: int | None, meeting: models.Meeting) -> models.Segment | None:
    """The transcript line an item added by hand was taken from (it must belong to the same meeting)."""
    from fastapi import HTTPException

    if not segment_id:
        return None
    seg = db.get(models.Segment, segment_id)
    if not seg or seg.meeting_id != meeting.id:
        raise HTTPException(422, "The evidence line must belong to the same meeting")
    return seg


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
    return meeting, evidence_line(db, segment_id, meeting)
