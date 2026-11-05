"""
Export the review feedback collected in the app as a labelled training file.

Every time a person confirms or rejects an extracted item, or corrects the label of a transcript
line, a row is written to ``label_feedback`` (services/review.py). This turns those rows into the
same CSV layout as the hand-labelled sets, so the classifier can be retrained on them:

    cd backend
    python -m app.export_feedback --out ../ml/data/labeled/feedback_v1.csv

Three safety steps:
1. Leakage: a sentence that also appears in a test set (test_v1, test_v2, in-domain) is dropped,
   otherwise the retrained model would be scored on sentences it was trained on.
2. One label per sentence: when people changed their mind, the latest decision wins.
3. Sentences already in the training set (train_v3) are skipped: they add nothing new.
"""

from __future__ import annotations

import argparse
import csv
import re
from collections import Counter
from pathlib import Path

from sqlalchemy import select

from .config import REPO_ROOT
from .database import SessionLocal
from . import models

LABELED = REPO_ROOT / "ml" / "data" / "labeled"
TEST_SETS = ["test_v1.csv", "test_v2.csv", "indomain_v1.csv"]
TRAIN_SET = "train_v3.csv"
FIELDS = ["segment_id", "meeting_id", "speaker", "text", "label", "predicted", "source", "annotated_at"]


def norm(text: str) -> str:
    """Compare sentences ignoring case, punctuation and spacing."""
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _texts(names: list[str]) -> set[str]:
    out: set[str] = set()
    for name in names:
        path = LABELED / name
        if path.exists():
            with path.open(encoding="utf-8") as f:
                out |= {norm(r["text"]) for r in csv.DictReader(f)}
    return out


def collect(db) -> dict:
    """Apply the three safety steps. Returns the rows to train on, the counts, and the status of
    every feedback row ("ready", "in test set", "already in training", "replaced": a later
    decision on the same sentence wins)."""
    rows = db.scalars(select(models.LabelFeedback).order_by(models.LabelFeedback.created_at,
                                                            models.LabelFeedback.id)).all()
    latest: dict[str, models.LabelFeedback] = {}
    for fb in rows:
        latest[norm(fb.text)] = fb          # later rows overwrite earlier ones
    test, train = _texts(TEST_SETS), _texts([TRAIN_SET])
    kept, stats = [], Counter(total=len(rows), unique=len(latest))
    status = {fb.id: "replaced" for fb in rows}
    for key, fb in latest.items():
        if not key:
            continue
        if key in test:
            stats["in_test_set"] += 1
            status[fb.id] = "in test set"
            continue
        if key in train:
            stats["already_in_training"] += 1
            status[fb.id] = "already in training"
            continue
        status[fb.id] = "ready"
        seg = db.get(models.Segment, fb.segment_id) if fb.segment_id else None
        kept.append({"segment_id": f"feedback.{fb.id}", "meeting_id": f"meeting.{seg.meeting_id}" if seg else "",
                     "speaker": seg.speaker if seg else "", "text": fb.text, "label": fb.corrected,
                     "predicted": fb.predicted, "source": "review",
                     "annotated_at": fb.created_at.date().isoformat() if fb.created_at else ""})
        stats["confirmed" if fb.predicted == fb.corrected else "corrected"] += 1
    stats["exported"] = len(kept)
    return {"rows": kept, "stats": stats, "labels": Counter(r["label"] for r in kept), "status": status}


def write_csv(rows: list[dict], f) -> None:
    w = csv.DictWriter(f, fieldnames=FIELDS)
    w.writeheader()
    w.writerows(rows)


def export(out: Path) -> dict:
    db = SessionLocal()
    try:
        result = collect(db)
    finally:
        db.close()
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as f:
        write_csv(result["rows"], f)
    return result


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=LABELED / "feedback_v1.csv")
    args = ap.parse_args(argv)
    result = export(args.out)
    s = result["stats"]
    print(f"Feedback rows in the database: {s['total']} ({s['unique']} different sentences)")
    print(f"  dropped, also in a test set:     {s['in_test_set']}")
    print(f"  dropped, already in training:    {s['already_in_training']}")
    print(f"  exported:                        {s['exported']}  (confirmed {s['confirmed']}, corrected {s['corrected']})")
    print("  labels: " + ", ".join(f"{k} {v}" for k, v in sorted(result["labels"].items())))
    print(f"-> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
