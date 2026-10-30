"""Audit trail: one row per change made through the API (also feeds the activity stream)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from .. import models


def log(db: Session, entity: str, entity_id: int, action: str, detail: str | None = None,
        actor_id: int | None = None, meeting_id: int | None = None) -> None:
    db.add(models.AuditLog(entity=entity, entity_id=entity_id, action=action, detail=detail,
                           actor_id=actor_id, meeting_id=meeting_id))
