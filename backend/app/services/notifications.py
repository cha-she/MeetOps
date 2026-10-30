"""
Per-user notifications.

``refresh`` runs whenever a user opens the notification list. It creates an
"overdue" or "due_soon" notification for each of that user's open, confirmed
tasks that needs one and does not already have one. Assignment, status-change
and review notifications are written by the endpoints and the pipeline as
things happen.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models


def refresh(db: Session, user: models.User) -> None:
    existing = {
        (task_id, type_)
        for task_id, type_ in db.execute(
            select(models.Notification.task_id, models.Notification.type).where(models.Notification.user_id == user.id))
    }
    tasks = db.scalars(select(models.Task).where(
        models.Task.owner_id == user.id, models.Task.status != "Completed",
        models.Task.review_status != "rejected", models.Task.deadline.is_not(None))).all()
    today = date.today()
    for t in tasks:
        days = (t.deadline - today).days
        if days < 0 and (t.id, "overdue") not in existing:
            n = abs(days)
            add(db, user.id, "overdue", f"“{t.description}” is overdue by {n} day{'' if n == 1 else 's'}.",
                task_id=t.id, meeting_id=t.meeting_id)
        elif 0 <= days <= 2 and (t.id, "due_soon") not in existing:
            when = "today" if days == 0 else "tomorrow" if days == 1 else "in 2 days"
            add(db, user.id, "due_soon", f"“{t.description}” is due {when}.", task_id=t.id, meeting_id=t.meeting_id)
    db.commit()


def add(db: Session, user_id: int | None, type_: str, message: str, task_id: int | None = None,
        meeting_id: int | None = None) -> None:
    if user_id is None:
        return
    db.add(models.Notification(user_id=user_id, type=type_, message=message, task_id=task_id, meeting_id=meeting_id))
