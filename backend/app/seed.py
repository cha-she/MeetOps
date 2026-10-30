"""
Prepare the database.

    python -m app.seed --empty     # wipe everything; the app then asks you to create the first administrator
    python -m app.seed --demo      # wipe, create a demo organisation and process the sample transcripts

Demo mode creates departments and one account per person, then runs every
sample transcript (``backend/samples/*.txt`` and ``ml/data/indomain/*.txt``)
through the real processing pipeline. Nothing in the registers is written by
hand: every task, decision and risk is what the system extracted.

Demo accounts sign in with their email and ``DEMO_PASSWORD`` below. They are
for local demonstrations only.
"""

from __future__ import annotations

import argparse
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import select

from . import models
from .config import REPO_ROOT, settings
from .database import Base, SessionLocal, engine, init_db
from .routers.auth import initials_of
from .security import hash_password
from .services import audit
from .services.pipeline import process_meeting

DEMO_PASSWORD = "meetops-demo-2026"
DEMO_DOMAIN = "meetops.demo"

DEPARTMENTS = ["Management", "Product", "Engineering", "Quality Assurance"]

# name, role, job title, department
PEOPLE = [
    ("Chanya Shehani", "admin", "Project Lead", "Management"),
    ("Dilini Wickrama", "manager", "Product Manager", "Product"),
    ("Ravindu Perera", "manager", "Engineering Lead", "Engineering"),
    ("Nethmi Fernando", "member", "ML Engineer", "Engineering"),
    ("Kasun Silva", "member", "Frontend Engineer", "Engineering"),
    ("Ishara Jayasuriya", "member", "QA Engineer", "Quality Assurance"),
]

# transcript file stem -> (title, days before today, department, uploaded by)
SAMPLES = {
    "incident_retrospective": ("Booking Service Outage Retro", 9, "Engineering", "Ravindu Perera"),
    "client_onboarding_review": ("Lanka Foods Onboarding Review", 6, "Product", "Dilini Wickrama"),
    "mobile_release_planning": ("Mobile App 2.3 Release Planning", 3, "Product", "Dilini Wickrama"),
    "sprint8_planning": ("Sprint 8 Planning", 1, "Engineering", "Chanya Shehani"),
}
SAMPLE_DIRS = [REPO_ROOT / "backend" / "samples", REPO_ROOT / "ml" / "data" / "indomain"]


def reset_schema() -> None:
    from . import models as _m  # noqa: F401  (registers the tables)
    Base.metadata.drop_all(engine)
    init_db()


def create_demo_org(db) -> dict[str, models.User]:
    depts = {name: models.Department(name=name) for name in DEPARTMENTS}
    db.add_all(depts.values())
    db.flush()
    pw = hash_password(DEMO_PASSWORD)
    users = {}
    for name, role, title, dept in PEOPLE:
        u = models.User(name=name, initials=initials_of(name), email=f"{name.split()[0].lower()}@{DEMO_DOMAIN}",
                        password_hash=pw, role=role, title=title, department_id=depts[dept].id)
        db.add(u)
        users[name] = u
    db.flush()
    for u in users.values():
        audit.log(db, "user", u.id, "created", f"{u.name} ({u.role})", actor_id=users["Chanya Shehani"].id)
    db.commit()
    return users


def process_samples(db, users: dict[str, models.User]) -> list[int]:
    files = {p.stem: p for d in SAMPLE_DIRS if d.exists() for p in sorted(d.glob("*.txt"))}
    depts = {d.name: d for d in db.scalars(select(models.Department))}
    ids = []
    for stem, (title, days_ago, dept, uploader) in sorted(SAMPLES.items(), key=lambda kv: -kv[1][1]):
        path = files.get(stem)
        if not path:
            print(f"  skipped {stem}: transcript not found")
            continue
        m = models.Meeting(title=title, date=date.today() - timedelta(days=days_ago), source="transcript",
                           status="Queued", pipeline_stage="upload", file_name=path.name,
                           department_id=depts[dept].id, uploaded_by_id=users[uploader].id)
        db.add(m)
        db.flush()
        audit.log(db, "meeting", m.id, "created", f"uploaded {path.name}", actor_id=users[uploader].id, meeting_id=m.id)
        db.commit()
        process_meeting(m.id, path.read_text(encoding="utf-8"))
        ids.append(m.id)
    return ids


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--empty", action="store_true", help="Wipe the database and leave it empty")
    mode.add_argument("--demo", action="store_true", help="Wipe, create demo accounts and process sample transcripts")
    args = ap.parse_args(argv)

    reset_schema()
    if args.empty:
        print("Database is empty. Start the app and create the first administrator account.")
        return 0

    settings.pipeline_stage_delay = 0
    with SessionLocal() as db:
        users = create_demo_org(db)
        ids = process_samples(db, users)
        for mid in ids:
            m = db.get(models.Meeting, mid)
            print(f"  {m.title:<34} {m.status:<10} tasks {len(m.tasks):>2}  decisions {len(m.decisions):>2}  "
                  f"risks {len(m.risks):>2}  {m.error_message or ''}")
    print(f"Demo organisation ready: {len(DEPARTMENTS)} departments, {len(PEOPLE)} accounts "
          f"(sign in as <firstname>@{DEMO_DOMAIN}; password in app/seed.py).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
