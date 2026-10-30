"""Aggregates for the dashboard and the Insights page (rejected items are never counted)."""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..serializers import risk_out


def _as_date(dt: datetime | None) -> date | None:
    return dt.date() if dt else None


def build(db: Session, user: models.User) -> schemas.InsightsSummary:
    meetings = db.scalars(select(models.Meeting)).all()
    tasks = db.scalars(select(models.Task).where(models.Task.review_status != "rejected")).all()
    decisions = db.scalars(select(models.Decision).where(models.Decision.review_status != "rejected")).all()
    risks = db.scalars(select(models.Risk).where(models.Risk.review_status != "rejected")).all()
    users = db.scalars(select(models.User).where(models.User.is_active.is_(True)).order_by(models.User.name)).all()
    departments = db.scalars(select(models.Department).order_by(models.Department.name)).all()

    today = date.today()
    week_end = today + timedelta(days=(6 - today.weekday()))
    week_start = today - timedelta(days=today.weekday())

    processed = [m for m in meetings if m.status == "Processed"]
    open_tasks = [t for t in tasks if t.status != "Completed"]
    overdue = [t for t in open_tasks if t.deadline and t.deadline < today]
    due_week = [t for t in open_tasks if t.deadline and today <= t.deadline <= week_end]
    suggested = [i for i in [*tasks, *decisions, *risks] if i.review_status == "suggested"]

    mine = [t for t in tasks if t.owner_id == user.id]
    my_open = [t for t in mine if t.status != "Completed"]
    me = schemas.MySummary(
        open_tasks=len(my_open),
        overdue_tasks=sum(1 for t in my_open if t.deadline and t.deadline < today),
        due_this_week=sum(1 for t in my_open if t.deadline and today <= t.deadline <= week_end),
        completed_this_week=sum(1 for t in mine if t.completed_at and _as_date(t.completed_at) >= week_start),
        pending_review=sum(1 for t in mine if t.review_status == "suggested"),
    )

    workload = []
    for u in users:
        own = [t for t in tasks if t.owner_id == u.id]
        if own:
            c = Counter(t.status for t in own)
            workload.append(schemas.Workload(
                user_id=u.id, name=u.name.split()[0], open=c["Open"], in_progress=c["In Progress"],
                completed=c["Completed"],
                overdue=sum(1 for t in own if t.status != "Completed" and t.deadline and t.deadline < today)))

    dept_stats = []
    for d in departments:
        dt = [t for t in tasks if t.owner and t.owner.department_id == d.id]
        if dt:
            done = sum(t.status == "Completed" for t in dt)
            dept_stats.append(schemas.DepartmentStat(
                name=d.name, open_tasks=sum(t.status != "Completed" for t in dt),
                overdue_tasks=sum(1 for t in dt if t.status != "Completed" and t.deadline and t.deadline < today),
                completion_rate=done / len(dt) * 100))

    weekly = []
    for k in range(7, -1, -1):
        start = week_start - timedelta(weeks=k)
        end = start + timedelta(days=6)
        weekly.append(schemas.WeeklyPoint(
            week=start.strftime("%d %b"),
            created=sum(1 for t in tasks if start <= _as_date(t.created_at) <= end),
            completed=sum(1 for t in tasks if t.completed_at and start <= _as_date(t.completed_at) <= end)))

    completed_with_deadline = [t for t in tasks if t.completed_at and t.deadline]
    on_time = (sum(_as_date(t.completed_at) <= t.deadline for t in completed_with_deadline)
               / len(completed_with_deadline) * 100) if completed_with_deadline else None

    reviewed = db.scalars(select(models.AuditLog).where(models.AuditLog.action.in_(("confirmed", "rejected")))).all()
    acceptance = (sum(a.action == "confirmed" for a in reviewed) / len(reviewed) * 100) if reviewed else None

    owner_counts = Counter(t.owner.name for t in tasks if t.owner)
    status_counts = Counter(t.status for t in tasks)
    severity_counts = Counter(r.severity for r in risks)
    total_items = len(tasks) + len(decisions) + len(risks)

    return schemas.InsightsSummary(
        totals=schemas.Totals(
            meetings=len(meetings), processed_meetings=len(processed),
            processing_meetings=sum(m.status in ("Processing", "Queued") for m in meetings),
            tasks=len(tasks), open_tasks=len(open_tasks), overdue_tasks=len(overdue), due_this_week=len(due_week),
            decisions=len(decisions), risks=len(risks), open_risks=sum(r.status == "Open" for r in risks),
            high_risks=sum(r.severity == "High" and r.status == "Open" for r in risks),
            pending_review=len(suggested),
        ),
        me=me,
        task_status=[schemas.NameValue(name=s, value=status_counts[s]) for s in ("Open", "In Progress", "Completed")],
        risk_severity=[schemas.NameValue(name=s, value=severity_counts[s]) for s in ("High", "Medium", "Low")],
        items_per_meeting=[
            schemas.ItemsPerMeeting(id=m.id, name=m.title if len(m.title) <= 18 else m.title[:17] + "…",
                                    tasks=sum(t.meeting_id == m.id for t in tasks),
                                    decisions=sum(d.meeting_id == m.id for d in decisions),
                                    risks=sum(r.meeting_id == m.id for r in risks))
            for m in sorted(processed, key=lambda m: (m.date, m.id))[-8:]
        ],
        workload=workload,
        departments=dept_stats,
        weekly=weekly,
        recurring_risks=[risk_out(r) for r in risks if r.recurring and r.status == "Open"],
        completion_rate=(status_counts["Completed"] / len(tasks) * 100) if tasks else 0.0,
        on_time_rate=on_time,
        avg_items_per_meeting=(total_items / len(processed)) if processed else 0.0,
        review_acceptance_rate=acceptance,
        top_owner=owner_counts.most_common(1)[0][0] if owner_counts else None,
    )


def now() -> datetime:
    return datetime.now(timezone.utc)
