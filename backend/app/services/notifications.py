"""
Notifications are derived from the task table.

``refresh`` is called whenever the notification list is requested: it creates
an "overdue" or "due_soon" notification for every open task that needs one
and does not already have one (one notification per task and type).
Notifications about assignments and status changes are written by the task
endpoints as the change happens.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models


def _days_until(d: date | None) -> int | None:
    return None if d is None else (d - date.today()).days


def refresh(db: Session) -> None:
    existing = {
        (task_id, type_)
        for task_id, type_ in db.execute(select(models.Notification.task_id, models.Notification.type))
    }
    open_tasks = db.scalars(select(models.Task).where(models.Task.status != "Completed")).all()
    for t in open_tasks:
        days = _days_until(t.deadline)
        if days is None:
            continue
        owner = t.owner.name if t.owner else "Unassigned"
        if days < 0 and (t.id, "overdue") not in existing:
            n = abs(days)
            db.add(models.Notification(type="overdue", task_id=t.id,
                                       message=f"“{t.description}” is overdue by {n} day{'' if n == 1 else 's'} ({owner})."))
        elif 0 <= days <= 2 and (t.id, "due_soon") not in existing:
            when = "today" if days == 0 else "tomorrow" if days == 1 else "in 2 days"
            db.add(models.Notification(type="due_soon", task_id=t.id, message=f"“{t.description}” is due {when}."))
    db.commit()


def add(db: Session, type_: str, message: str, task_id: int | None = None) -> None:
    db.add(models.Notification(type=type_, message=message, task_id=task_id))
