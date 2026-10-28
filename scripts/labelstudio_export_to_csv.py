"""
Convert a Label Studio JSON export into the MeetOps labelled dataset.

In Label Studio: Project > Export > JSON (not JSON-MIN). Then:

    python scripts/labelstudio_export_to_csv.py --export path/to/export.json \
        --out ml/data/labeled/labels_v1.csv

Only tasks with at least one completed annotation are written. If a task has
several annotations the most recent one wins. The pre-label is kept alongside
the final label so we can report how often the weak labels were right.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from pathlib import Path

FIELDS = [
    "segment_id", "meeting_id", "speaker", "start_time", "end_time", "text",
    "label", "owner_span", "deadline_span", "decided_by_span", "notes",
    "prelabel", "prelabel_source", "annotated_at",
]


def extract(annotation: dict) -> dict:
    label = ""
    spans: dict[str, list[str]] = {"OWNER": [], "DEADLINE": [], "DECIDED_BY": []}
    notes = ""
    for item in annotation.get("result", []):
        kind = item.get("type")
        value = item.get("value", {})
        if kind == "choices" and item.get("from_name") == "label":
            choices = value.get("choices") or []
            label = choices[0] if choices else ""
        elif kind == "labels" and item.get("from_name") == "spans":
            for tag in value.get("labels", []):
                if tag in spans:
                    spans[tag].append(value.get("text", ""))
        elif kind == "textarea" and item.get("from_name") == "notes":
            notes = " ".join(value.get("text", []))
    return {
        "label": label,
        "owner_span": " | ".join(spans["OWNER"]),
        "deadline_span": " | ".join(spans["DEADLINE"]),
        "decided_by_span": " | ".join(spans["DECIDED_BY"]),
        "notes": notes,
        "annotated_at": annotation.get("updated_at") or annotation.get("created_at") or "",
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--export", required=True, type=Path, help="Label Studio JSON export")
    ap.add_argument("--out", type=Path, default=Path("ml/data/labeled/labels_v1.csv"))
    args = ap.parse_args(argv)

    tasks = json.loads(args.export.read_text(encoding="utf-8"))
    rows = []
    agree = 0
    label_counts: Counter[str] = Counter()
    for task in tasks:
        annotations = [a for a in task.get("annotations", []) if not a.get("was_cancelled")]
        if not annotations:
            continue
        latest = max(annotations, key=lambda a: a.get("updated_at") or a.get("created_at") or "")
        data = task.get("data", {})
        ann = extract(latest)
        if not ann["label"]:
            continue
        row = {
            "segment_id": data.get("segment_id", ""),
            "meeting_id": data.get("meeting_id", ""),
            "speaker": data.get("speaker", ""),
            "start_time": data.get("start_time", ""),
            "end_time": data.get("end_time", ""),
            "text": data.get("text", ""),
            "prelabel": data.get("prelabel", ""),
            "prelabel_source": data.get("prelabel_source", ""),
            **ann,
        }
        rows.append(row)
        label_counts[row["label"]] += 1
        agree += int(row["label"] == row["prelabel"])

    rows.sort(key=lambda r: (r["meeting_id"], float(r["start_time"] or 0)))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)

    n = len(rows)
    print(f"Wrote {n} labelled utterances to {args.out}")
    if n:
        print("  label distribution: " + ", ".join(f"{k}={v} ({v / n:.1%})" for k, v in label_counts.most_common()))
        print(f"  pre-label agreement: {agree / n:.1%}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
