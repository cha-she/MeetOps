"""
Build a Label Studio import file from the pre-labelled AMI utterances.

Each task carries the utterance text plus context fields shown in the
labelling interface, and a *prediction* holding the pre-label so the radio
button is already selected when the task opens. The annotator confirms or
changes it; Label Studio records the final choice as an annotation.

Two sampling modes
------------------
* ``--mode full``     every candidate utterance of the chosen meetings, in time
                      order. Use this for a *test set*: it reflects the real
                      class distribution (mostly Other), so evaluation on it
                      is honest.
* ``--mode enriched`` all utterances whose pre-label is Task / Decision / Risk
                      plus a random sample of Other candidates, drawn from the
                      chosen meetings. Use this for the *training set*: it
                      gives many more minority-class examples per hour of
                      labelling. The resulting class mix is not natural, which
                      is why training uses class weights and the test set is
                      kept separate.

Only "candidate" utterances are included (content-bearing, not backchannels or
fragments) unless --include-noise is given.

Examples
--------
    # Test set: two whole meetings
    python scripts/labelstudio_tasks.py --mode full --meetings ES2002a ES2003a \
        --out ml/labelstudio/tasks_test.json

    # Training set: enriched sample from all other scenario meetings
    python scripts/labelstudio_tasks.py --mode enriched --series ES IS TS \
        --exclude ES2002a ES2003a --max-tasks 1200 --out ml/labelstudio/tasks_train1.json
"""

from __future__ import annotations

import argparse
import csv
import json
import random
from collections import Counter
from pathlib import Path

MINORITY = ("Task", "Decision", "Risk")


def hms(seconds: str) -> str:
    try:
        s = int(float(seconds))
    except (TypeError, ValueError):
        return "--:--:--"
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


def to_task(r: dict[str, str]) -> dict:
    data = {
        "segment_id": r["segment_id"],
        "meeting_id": r["meeting_id"],
        "speaker": r["speaker"],
        "timestamp": hms(r.get("start_time", "")),
        "start_time": r.get("start_time", ""),
        "end_time": r.get("end_time", ""),
        "da_type": r.get("da_type", "") or "-",
        "text": r["text"],
        "prelabel": r["prelabel"],
        "prelabel_source": r["prelabel_source"],
        "prelabel_confidence": r["prelabel_confidence"],
    }
    return {
        "data": data,
        "predictions": [{
            "model_version": "prelabel-v1",
            "score": float(r["prelabel_confidence"]),
            "result": [{
                "from_name": "label",
                "to_name": "text",
                "type": "choices",
                "value": {"choices": [r["prelabel"]]},
            }],
        }],
    }


def select_meetings(all_meetings: list[str], args: argparse.Namespace) -> list[str]:
    chosen = all_meetings
    if args.meetings:
        chosen = [m for m in args.meetings if m in all_meetings]
        missing = sorted(set(args.meetings) - set(chosen))
        if missing:
            print(f"warning: meetings not found in input: {', '.join(missing)}")
    elif args.series:
        prefixes = tuple(s.upper() for s in args.series)
        chosen = [m for m in all_meetings if m.upper().startswith(prefixes)]
    if args.exclude:
        chosen = [m for m in chosen if m not in set(args.exclude)]
    if args.max_meetings:
        chosen = chosen[: args.max_meetings]
    return chosen


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--in", dest="src", type=Path, default=Path("ml/data/processed/ami_prelabels.csv"))
    ap.add_argument("--out", type=Path, default=Path("ml/labelstudio/tasks_batch1.json"))
    ap.add_argument("--mode", choices=["full", "enriched"], default="full")
    ap.add_argument("--meetings", nargs="*", help="Meeting ids to include")
    ap.add_argument("--series", nargs="*", help="Meeting id prefixes to include, e.g. ES IS TS")
    ap.add_argument("--exclude", nargs="*", help="Meeting ids to leave out (e.g. the test meetings)")
    ap.add_argument("--max-meetings", type=int, help="Keep only the first N selected meetings")
    ap.add_argument("--max-tasks", type=int, help="Cap the number of tasks written")
    ap.add_argument("--other-ratio", type=float, default=1.0,
                    help="enriched mode: Other samples per minority-class utterance (default 1.0)")
    ap.add_argument("--seed", type=int, default=42, help="Random seed for reproducible sampling")
    ap.add_argument("--include-noise", action="store_true", help="Also include backchannels / fragments")
    args = ap.parse_args(argv)

    with args.src.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    all_meetings = sorted({r["meeting_id"] for r in rows})
    chosen = select_meetings(all_meetings, args)
    chosen_set = set(chosen)

    pool = [
        r for r in rows
        if r["meeting_id"] in chosen_set and (args.include_noise or r.get("is_candidate") == "1")
    ]

    rng = random.Random(args.seed)
    if args.mode == "full":
        selected = pool
        if args.max_tasks:
            selected = selected[: args.max_tasks]
    else:
        minority = [r for r in pool if r["prelabel"] in MINORITY]
        others = [r for r in pool if r["prelabel"] not in MINORITY]
        if args.max_tasks:
            # Respect the cap while keeping the requested minority:other ratio.
            n_min = min(len(minority), int(args.max_tasks / (1 + args.other_ratio)))
            minority = rng.sample(minority, n_min) if n_min < len(minority) else minority
        n_other = min(len(others), int(round(len(minority) * args.other_ratio)))
        if args.max_tasks:
            n_other = min(n_other, args.max_tasks - len(minority))
        selected = minority + rng.sample(others, n_other)

    # Keep meeting/time order so the annotator can follow the conversation.
    selected.sort(key=lambda r: (r["meeting_id"], float(r.get("start_time") or 0)))
    tasks = [to_task(r) for r in selected]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(tasks, ensure_ascii=False, indent=1), encoding="utf-8")

    per_meeting = Counter(r["meeting_id"] for r in selected)
    per_label = Counter(r["prelabel"] for r in selected)
    per_source = Counter(r["prelabel_source"] for r in selected)
    print(f"Wrote {len(tasks)} tasks ({args.mode} mode) from {len(per_meeting)} meetings to {args.out}")
    print("  pre-label mix : " + ", ".join(f"{k}={v}" for k, v in per_label.most_common()))
    print("  pre-label src : " + ", ".join(f"{k}={v}" for k, v in per_source.most_common()))
    shown = ", ".join(f"{m}={per_meeting[m]}" for m in sorted(per_meeting)[:12])
    more = f" … (+{len(per_meeting) - 12} more)" if len(per_meeting) > 12 else ""
    print(f"  per meeting   : {shown}{more}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
