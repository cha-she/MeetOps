"""ORM rows -> API models (the few shapes that are not a plain field copy)."""

from __future__ import annotations

from . import models, schemas


def hms(seconds: float | None) -> str | None:
    if seconds is None:
        return None
    s = int(seconds)
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


def user_out(u: models.User | None) -> schemas.UserOut | None:
    return schemas.UserOut.model_validate(u) if u else None


def evidence(seg: models.Segment | None, fallback_quote: str) -> schemas.EvidenceRef:
    if seg is None:
        return schemas.EvidenceRef(segment_id=0, speaker=None, timestamp=None, quote=fallback_quote)
    return schemas.EvidenceRef(segment_id=seg.id, speaker=seg.speaker, timestamp=hms(seg.start_sec), quote=seg.text)


def meeting_out(m: models.Meeting) -> schemas.MeetingOut:
    return schemas.MeetingOut(
        id=m.id, title=m.title, date=m.date, duration_min=m.duration_min, source=m.source,
        status=m.status, pipeline_stage=m.pipeline_stage, error_message=m.error_message,
        participants=[user_out(p) for p in m.participants],
        task_count=len(m.tasks), decision_count=len(m.decisions), risk_count=len(m.risks),
        summary=m.summary, created_at=m.created_at,
    )


def segment_out(s: models.Segment) -> schemas.SegmentOut:
    return schemas.SegmentOut(id=s.id, speaker=s.speaker, timestamp=hms(s.start_sec), start_sec=s.start_sec,
                              text=s.text, category=s.category, confidence=s.confidence)


def task_out(t: models.Task) -> schemas.TaskOut:
    return schemas.TaskOut(
        id=t.id, description=t.description, owner=user_out(t.owner), meeting_id=t.meeting_id,
        meeting_title=t.meeting.title, deadline=t.deadline, status=t.status, created_at=t.created_at,
        evidence=evidence(t.segment, t.description),
    )


def decision_out(d: models.Decision) -> schemas.DecisionOut:
    return schemas.DecisionOut(
        id=d.id, statement=d.statement, owner=user_out(d.owner), meeting_id=d.meeting_id,
        meeting_title=d.meeting.title, decided_at=d.decided_at, evidence=evidence(d.segment, d.statement),
    )


def risk_out(r: models.Risk) -> schemas.RiskOut:
    return schemas.RiskOut(
        id=r.id, description=r.description, meeting_id=r.meeting_id, meeting_title=r.meeting.title,
        severity=r.severity, raised_at=r.raised_at, recurring=r.recurring, evidence=evidence(r.segment, r.description),
    )
