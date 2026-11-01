"""ORM rows -> API models (the few shapes that are not a plain field copy)."""

from __future__ import annotations

from . import models, schemas


def hms(seconds: float | None) -> str | None:
    if seconds is None:
        return None
    s = int(seconds)
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


def dept_ref(d: models.Department | None) -> schemas.DepartmentRef | None:
    return schemas.DepartmentRef(id=d.id, name=d.name) if d else None


def user_out(u: models.User | None) -> schemas.UserOut | None:
    if u is None:
        return None
    return schemas.UserOut(id=u.id, name=u.name, initials=u.initials, email=u.email, role=u.role,
                           title=u.title, department=dept_ref(u.department), is_active=u.is_active)


def evidence(seg: models.Segment | None) -> schemas.EvidenceRef | None:
    if seg is None:
        return None
    return schemas.EvidenceRef(segment_id=seg.id, speaker=seg.speaker, timestamp=hms(seg.start_sec), quote=seg.text)


def _visible(items) -> list:
    return [i for i in items if i.review_status != "rejected"]


def meeting_out(m: models.Meeting) -> schemas.MeetingOut:
    tasks, decisions, risks = _visible(m.tasks), _visible(m.decisions), _visible(m.risks)
    return schemas.MeetingOut(
        id=m.id, title=m.title, date=m.date, duration_min=m.duration_min, source=m.source,
        status=m.status, pipeline_stage=m.pipeline_stage, error_message=m.error_message,
        participants=[user_out(p) for p in m.participants], department=dept_ref(m.department),
        uploaded_by=user_out(m.uploaded_by),
        task_count=len(tasks), decision_count=len(decisions), risk_count=len(risks),
        suggested_count=sum(i.review_status == "suggested" for i in tasks + decisions + risks),
        summary=m.summary, model_name=m.model_name, created_at=m.created_at,
    )


def segment_out(s: models.Segment) -> schemas.SegmentOut:
    return schemas.SegmentOut(id=s.id, speaker=s.speaker, timestamp=hms(s.start_sec), start_sec=s.start_sec,
                              text=s.text, category=s.category, confidence=s.confidence,
                              model_label=s.model_label, rule=s.rule, corrected=s.corrected)


def task_out(t: models.Task) -> schemas.TaskOut:
    return schemas.TaskOut(
        id=t.id, description=t.description, owner=user_out(t.owner),
        owner_name=t.owner.name if t.owner else t.owner_name, meeting_id=t.meeting_id,
        meeting_title=t.meeting.title, meeting_date=t.meeting.date, department=dept_ref(t.meeting.department),
        deadline=t.deadline, deadline_text=t.deadline_text, status=t.status, priority=t.priority,
        review_status=t.review_status, confidence=t.confidence, source=t.source,
        created_at=t.created_at, completed_at=t.completed_at, evidence=evidence(t.segment),
    )


def decision_out(d: models.Decision) -> schemas.DecisionOut:
    return schemas.DecisionOut(
        id=d.id, statement=d.statement, owner=user_out(d.owner),
        owner_name=d.owner.name if d.owner else d.owner_name, meeting_id=d.meeting_id,
        meeting_title=d.meeting.title, department=dept_ref(d.meeting.department), decided_at=d.decided_at,
        review_status=d.review_status, confidence=d.confidence, source=d.source, evidence=evidence(d.segment),
    )


def risk_out(r: models.Risk) -> schemas.RiskOut:
    return schemas.RiskOut(
        id=r.id, description=r.description, meeting_id=r.meeting_id, meeting_title=r.meeting.title,
        department=dept_ref(r.meeting.department), severity=r.severity, status=r.status, owner=user_out(r.owner),
        raised_by=r.raised_by, raised_at=r.raised_at, recurring=r.recurring, review_status=r.review_status,
        confidence=r.confidence, source=r.source, evidence=evidence(r.segment),
    )


def activity_out(a: models.AuditLog) -> schemas.ActivityOut:
    return schemas.ActivityOut(id=a.id, actor=user_out(a.actor), entity=a.entity, entity_id=a.entity_id,
                               action=a.action, detail=a.detail, meeting_id=a.meeting_id, created_at=a.created_at)
