"""
Human review of extracted items, and corrections of the classifier.

* ``set_review`` confirms or rejects a task / decision / risk. A rejection is
  also stored as label feedback ("the model said Task, a person says Other").
* ``reclassify_segment`` lets a person mark any transcript line as Task,
  Decision, Risk or Other. The item linked to that line is replaced by one of
  the new type (confirmed, because a person chose it) and the correction is
  stored as label feedback.

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
        item = models.Task(description=extraction.task_title(seg.text, users) or extraction.tidy(seg.text),
                           owner_id=f.owner.id if f.owner else None, deadline=f.deadline,
                           deadline_text=f.deadline_text, status="Open", reviewed_by_id=user.id, **common)
    elif category == "Decision":
        owner = extraction.match_user(seg.speaker, users)
        item = models.Decision(statement=extraction.tidy(seg.text), owner_id=owner.id if owner else None,
                               decided_at=meeting.date, reviewed_by_id=user.id, **common)
    elif category == "Risk":
        item = models.Risk(description=extraction.tidy(seg.text), severity=extraction.risk_severity(seg.text),
                           raised_at=meeting.date, raised_by=seg.speaker, reviewed_by_id=user.id, **common)
    if item is not None:
        db.add(item)
    audit.log(db, "segment", seg.id, "reclassified", f"{before} -> {category}: {seg.text[:80]}",
              actor_id=user.id, meeting_id=meeting.id)
    return item
