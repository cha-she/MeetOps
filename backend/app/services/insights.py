"""Aggregates for the dashboard and the Insights page."""

from __future__ import annotations

from collections import Counter
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..serializers import risk_out


def build(db: Session) -> schemas.InsightsSummary:
    meetings = db.scalars(select(models.Meeting)).all()
    tasks = db.scalars(select(models.Task)).all()
    decisions = db.scalars(select(models.Decision)).all()
    risks = db.scalars(select(models.Risk)).all()
    users = db.scalars(select(models.User).order_by(models.User.id)).all()

    processed = [m for m in meetings if m.status == "Processed"]
    open_tasks = [t for t in tasks if t.status != "Completed"]
    overdue = [t for t in open_tasks if t.deadline and t.deadline < date.today()]

    workload = []
    for u in users:
        mine = [t for t in tasks if t.owner_id == u.id]
        if mine:
            c = Counter(t.status for t in mine)
            workload.append(schemas.Workload(name=u.name.split()[0], open=c["Open"],
                                             in_progress=c["In Progress"], completed=c["Completed"]))

    owner_counts = Counter(t.owner.name for t in tasks if t.owner)
    top_owner = owner_counts.most_common(1)[0][0] if owner_counts else None
    status_counts = Counter(t.status for t in tasks)
    severity_counts = Counter(r.severity for r in risks)
    total_items = len(tasks) + len(decisions) + len(risks)

    return schemas.InsightsSummary(
        totals=schemas.Totals(
            meetings=len(meetings), processed_meetings=len(processed),
            processing_meetings=sum(m.status in ("Processing", "Queued") for m in meetings),
            tasks=len(tasks), open_tasks=len(open_tasks), overdue_tasks=len(overdue),
            decisions=len(decisions), risks=len(risks), high_risks=severity_counts["High"],
        ),
        task_status=[schemas.NameValue(name=s, value=status_counts[s]) for s in ("Open", "In Progress", "Completed")],
        risk_severity=[schemas.NameValue(name=s, value=severity_counts[s]) for s in ("High", "Medium", "Low")],
        items_per_meeting=[
            schemas.ItemsPerMeeting(name=m.title if len(m.title) <= 16 else m.title[:15] + "…",
                                    tasks=len(m.tasks), decisions=len(m.decisions), risks=len(m.risks))
            for m in sorted(processed, key=lambda m: m.date)
        ],
        workload=workload,
        recurring_risks=[risk_out(r) for r in risks if r.recurring],
        completion_rate=(status_counts["Completed"] / len(tasks) * 100) if tasks else 0.0,
        avg_items_per_meeting=(total_items / len(processed)) if processed else 0.0,
        top_owner=top_owner,
    )
