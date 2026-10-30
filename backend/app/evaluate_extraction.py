"""
Evaluate owner and deadline extraction against the labelled spans.

    python -m app.evaluate_extraction            # uses ml/data/labeled/indomain_v1.csv

For every utterance labelled Task, the extractor runs on that single sentence
(as the pipeline does before merging replies) and is compared with the
annotated ``owner_span`` (a person's first name, or empty) and
``deadline_span`` (the time phrase, or empty).

Owner accuracy  : extracted owner == annotated owner (both empty counts as correct).
Deadline found  : a time phrase was found exactly when one was annotated.
Phrase match    : for annotated deadlines, the extracted phrase contains the annotated one.
"""

from __future__ import annotations

import argparse
import csv
from datetime import date
from pathlib import Path

from . import models
from .config import REPO_ROOT
from .services.extraction import find_owner, parse_deadline

DEFAULT = REPO_ROOT / "ml" / "data" / "labeled" / "indomain_v1.csv"
PEOPLE = ["Chanya Shehani", "Dilini Wickrama", "Ravindu Perera", "Nethmi Fernando", "Kasun Silva", "Ishara Jayasuriya"]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=DEFAULT)
    args = ap.parse_args(argv)

    users = [models.User(id=i + 1, name=n, initials="".join(p[0] for p in n.split())) for i, n in enumerate(PEOPLE)]
    rows = [r for r in csv.DictReader(args.data.open(encoding="utf-8")) if r["label"] == "Task"]
    base = date(2026, 10, 29)

    owner_ok = found_ok = phrase_ok = phrase_total = 0
    errors = []
    for r in rows:
        owner = find_owner(r["text"], r["speaker"], users)
        got_owner = owner.name.split()[0] if owner else ""
        gold_owner = r["owner_span"].strip()
        _, phrase = parse_deadline(r["text"], base)
        gold_dl = r["deadline_span"].strip()

        owner_ok += got_owner == gold_owner
        found_ok += bool(phrase) == bool(gold_dl)
        if gold_dl:
            phrase_total += 1
            phrase_ok += bool(phrase) and gold_dl.lower() in phrase.lower()
        if got_owner != gold_owner or bool(phrase) != bool(gold_dl):
            errors.append(f"  owner {got_owner or '-':8} (gold {gold_owner or '-':8}) deadline {phrase or '-':22} "
                          f"(gold {gold_dl or '-'}) | {r['text']}")

    n = len(rows)
    print(f"{args.data.name}: {n} Task utterances")
    print(f"  owner accuracy         {owner_ok}/{n} = {owner_ok / n:.2f}")
    print(f"  deadline found/absent  {found_ok}/{n} = {found_ok / n:.2f}")
    print(f"  deadline phrase match  {phrase_ok}/{phrase_total} = {phrase_ok / max(phrase_total, 1):.2f}")
    if errors:
        print("\nDisagreements:")
        print("\n".join(errors))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
