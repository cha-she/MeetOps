"""
Seed the database with a small realistic project history.

    python -m app.seed            # refuses if data already exists
    python -m app.seed --reset    # drops and recreates all tables first

Dates are relative to today so deadlines, overdue flags and notifications
stay meaningful whenever the demo is opened. The same people and meetings
appear in the frontend's built-in demo dataset, so switching between demo
data and the live API looks consistent.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select

from . import models
from .database import Base, SessionLocal, engine, init_db
from .services import audit

USERS = [
    ("Chanya Shehani", "CS", "Admin"),
    ("Ravindu Perera", "RP", "Backend Engineer"),
    ("Nethmi Fernando", "NF", "ML Engineer"),
    ("Kasun Silva", "KS", "Frontend Engineer"),
    ("Ishara Jayasuriya", "IJ", "QA / PMO"),
    ("Dilini Wickrama", "DW", "Product Manager"),
]

# (title, days_ago, duration, source, participant indexes, summary)
MEETINGS = [
    ("Sprint 7 Planning", 3, 52, "video", [1, 2, 3, 4, 5],
     "Scoped Sprint 7 around the classification model and the task tracker UI. Agreed to freeze the segment "
     "schema and prioritise the AMI subset annotation. Two risks flagged around annotation throughput and ASR "
     "accuracy on overlapping speech."),
    ("Client Review — Northwind SME", 6, 41, "audio", [1, 6, 2],
     "Walked Northwind through the decision register and risk log. Client requested export to PDF and a weekly "
     "digest email. Approved the RBAC roles for their PMO team."),
    ("ML Model Sync", 8, 34, "transcript", [3, 1, 2],
     "Reviewed baseline results of the TF-IDF classifiers on the labelled subset. Decided to trial DistilBERT "
     "fine-tuning. Risks around class imbalance for the Risk category and limited labelled data."),
    ("Ops Review — Week 26", 10, 28, "video", [1, 5, 6, 4],
     "Reviewed overdue tasks from Sprint 6 and reassigned two items. Decided to move the demo environment to a "
     "shared staging server."),
]

# (meeting index, speaker first name, start_sec, text, category, confidence)
SEGMENTS = [
    (1, "Chanya", 475, "Okay, let's talk scope for Sprint 7. Two big things: the classifier and the task tracker UI.", "Other", 0.72),
    (1, "Chanya", 492, "Ravindu, can you lock the segment schema this week so the ML side isn't shifting under us?", "Task", 0.93),
    (1, "Chanya", 580, "Decision: we freeze the schema at the end of this sprint.", "Decision", 0.96),
    (1, "Nethmi", 1300, "I'll take the first batch of annotations, target five hundred segments by the weekend.", "Task", 0.91),
    (1, "Nethmi", 1335, "We'll focus on annotating AMI first rather than gathering more data.", "Decision", 0.88),
    (1, "Nethmi", 1490, "If annotation slips, the whole training timeline slips with it.", "Risk", 0.90),
    (1, "Kasun", 1985, "I can have the task tracker table done before the next standup.", "Task", 0.89),
    (1, "Ravindu", 2232, "Cross-talk is where Whisper starts making things up.", "Risk", 0.84),
    (1, "Nethmi", 2468, "Given the class imbalance, macro-F1 is the metric we report on.", "Decision", 0.87),
    (1, "Chanya", 2720, "Great, thanks everyone. Same time next week.", "Other", 0.79),
    (2, "Dilini", 922, "The client explicitly asked for PDF export of the decision register.", "Task", 0.86),
    (2, "Dilini", 1143, "They'd love a weekly digest so nothing slips through the cracks.", "Task", 0.81),
    (2, "Chanya", 1664, "Approved — five roles, with HR and finance on the restricted viewer tier.", "Decision", 0.92),
    (2, "Dilini", 1870, "Both of those are must-haves for the pilot, let's commit to them.", "Decision", 0.85),
    (2, "Dilini", 2058, "The pilot date is fixed, and we still owe them exports.", "Risk", 0.83),
    (3, "Nethmi", 707, "Let's spin up a DistilBERT run and compare it against the SVM baseline.", "Task", 0.90),
    (3, "Nethmi", 800, "We try DistilBERT, but the SVM stays as our safety net.", "Decision", 0.88),
    (3, "Ravindu", 1458, "The transcripts get messy when two people talk over each other.", "Task", 0.74),
    (3, "Nethmi", 1720, "We have far fewer Risk examples than Tasks, that'll hurt recall.", "Risk", 0.91),
    (3, "Nethmi", 1742, "The Risk class is starved — we need more labelled risk examples.", "Task", 0.82),
    (3, "Ravindu", 1915, "Three thousand segments is thin for a transformer.", "Risk", 0.80),
    (3, "Nethmi", 1982, "AMI is meetings, but not our client's exact domain.", "Risk", 0.77),
    (4, "Ishara", 415, "I'll clean up the board and reassign the two overdue tasks today.", "Task", 0.92),
    (4, "Chanya", 1110, "Let's get the demo onto staging so everyone can hit the same build.", "Task", 0.85),
    (4, "Chanya", 1142, "Agreed, staging becomes the single demo environment.", "Decision", 0.90),
    (4, "Ishara", 1300, "Let's not migrate the day before the demo.", "Risk", 0.78),
    (4, "Dilini", 1391, "We need the evaluation deck ready well before the review.", "Task", 0.87),
]

# (description, owner index, segment index (1-based in SEGMENTS), deadline offset days, status)
TASKS = [
    ("Freeze the transcript segment schema and document the fields", 2, 2, 1, "In Progress"),
    ("Annotate the first 500 AMI segments in Label Studio", 3, 4, 4, "In Progress"),
    ("Build the Task Tracker table with status and deadline columns", 4, 7, 2, "Completed"),
    ("Add PDF export for the decision register", 4, 11, 6, "Open"),
    ("Implement weekly digest email for task owners", 2, 12, 9, "Open"),
    ("Set up DistilBERT fine-tuning experiment on the labelled subset", 3, 16, -2, "Open"),
    ("Fix overlapping-speech handling in the ASR preprocessing step", 2, 18, -4, "In Progress"),
    ("Reassign Sprint 6 overdue items and update the board", 5, 23, -7, "Completed"),
    ("Migrate the demo environment to the shared staging server", 4, 24, 0, "In Progress"),
    ("Prepare mid-progress evaluation slide deck", 1, 27, 2, "In Progress"),
    ("Balance the Risk class with additional labelled examples", 3, 20, 3, "Open"),
]

# (statement, owner index, segment index)
DECISIONS = [
    ("Freeze the segment schema after Sprint 7; no further field changes without sign-off.", 1, 3),
    ("Prioritise annotating the AMI subset over collecting new recordings.", 3, 5),
    ("Adopt macro-F1 as the primary classification metric for evaluation.", 3, 9),
    ("Approve the RBAC role set (Admin, Manager, Lead, Staff, Viewer) for the client.", 1, 13),
    ("Ship PDF export and weekly digest before the client pilot.", 6, 14),
    ("Trial DistilBERT fine-tuning; keep SVM as the fallback baseline.", 3, 17),
    ("Move the demo environment to the shared staging server.", 1, 25),
]

# (description, severity, recurring, segment index)
RISKS = [
    ("Annotation throughput may not keep pace with the model training schedule.", "High", True, 6),
    ("ASR accuracy drops on overlapping / cross-talk speech segments.", "Medium", True, 8),
    ("Class imbalance for the Risk category could bias the classifier.", "High", False, 19),
    ("Limited labelled data may cap achievable model accuracy.", "Medium", False, 21),
    ("Single dependency on the AMI corpus limits domain generalisation.", "Low", False, 22),
    ("Client pilot deadline is tight given the export features backlog.", "Medium", False, 15),
    ("Staging migration may cause demo downtime during the review week.", "Low", False, 26),
]


def seed(db) -> None:
    today = date.today()
    users = [models.User(name=n, initials=i, role=r) for n, i, r in USERS]
    db.add_all(users)
    db.flush()

    meetings = []
    for title, days_ago, duration, source, parts, summary in MEETINGS:
        m = models.Meeting(
            title=title, date=today - timedelta(days=days_ago), duration_min=duration, source=source,
            status="Processed", summary=summary,
            created_at=datetime.combine(today - timedelta(days=days_ago), time(10, 0), tzinfo=timezone.utc),
        )
        m.participants = [users[i - 1] for i in parts]
        db.add(m)
        meetings.append(m)
    db.flush()

    segments = []
    positions = {}
    for mi, speaker, start, text, cat, conf in SEGMENTS:
        pos = positions.get(mi, 0)
        positions[mi] = pos + 1
        s = models.Segment(meeting_id=meetings[mi - 1].id, position=pos, speaker=speaker, start_sec=start,
                           text=text, category=cat, confidence=conf)
        db.add(s)
        segments.append(s)
    db.flush()

    for desc, owner, seg_i, offset, status in TASKS:
        seg = segments[seg_i - 1]
        db.add(models.Task(meeting_id=seg.meeting_id, segment_id=seg.id, description=desc, owner_id=users[owner - 1].id,
                           deadline=today + timedelta(days=offset), status=status,
                           created_at=seg.meeting.created_at))
    for stmt, owner, seg_i in DECISIONS:
        seg = segments[seg_i - 1]
        db.add(models.Decision(meeting_id=seg.meeting_id, segment_id=seg.id, statement=stmt,
                               owner_id=users[owner - 1].id, decided_at=seg.meeting.date))
    for desc, sev, rec, seg_i in RISKS:
        seg = segments[seg_i - 1]
        db.add(models.Risk(meeting_id=seg.meeting_id, segment_id=seg.id, description=desc, severity=sev,
                           recurring=rec, raised_at=seg.meeting.date))
    db.flush()

    deck = db.scalar(select(models.Task).where(models.Task.description.like("Prepare mid-progress%")))
    db.add(models.Notification(type="assigned", task_id=deck.id, read=True,
                               message="You were assigned “Prepare mid-progress evaluation slide deck”.",
                               created_at=datetime.now(timezone.utc) - timedelta(days=10)))
    for m in meetings:
        audit.log(db, "meeting", m.id, "seeded", m.title)
    db.commit()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--reset", action="store_true", help="Drop all tables before seeding")
    args = ap.parse_args(argv)

    if args.reset:
        from . import models as _m  # noqa: F401
        Base.metadata.drop_all(engine)
    init_db()
    with SessionLocal() as db:
        if db.scalar(select(models.User).limit(1)):
            print("Database already has data. Use --reset to start over.")
            return 1
        seed(db)
        print(f"Seeded {len(USERS)} users, {len(MEETINGS)} meetings, {len(SEGMENTS)} segments, "
              f"{len(TASKS)} tasks, {len(DECISIONS)} decisions, {len(RISKS)} risks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
