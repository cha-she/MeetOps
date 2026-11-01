"""
Evaluate owner and deadline extraction against the labelled spans, for every engine.

    python -m app.evaluate_extraction

Engines (``EXTRACTION_ENGINE``):
  rules   regular expressions + dateparser (extraction.py)
  spacy   spaCy en_core_web_sm: dependency parse for the owner, NER DATE/TIME for the deadline (nlp.py)
  hybrid  rules first, spaCy for what they do not find (the default)

Data:
  in-domain  ml/data/labeled/indomain_v1.csv, 22 Task utterances with annotated owner and deadline
  AMI        Task utterances of train_v2.csv + test_v1.csv with an annotated deadline span
             (AMI owners are annotated as pronouns, so only deadlines are measured there)
  probe      16 unseen task sentences (new names and phrasings) written after the rules, to measure
             how well each engine generalises beyond the data the rules were developed on

For every Task utterance the extractor runs on that single sentence and is compared with the annotation:
  owner accuracy   extracted first name == annotated owner (both empty counts as correct)
  deadline         precision / recall / F1 of "a deadline phrase was found", plus whether the
                   extracted phrase contains the annotated one
"""

from __future__ import annotations

import csv
from datetime import date

from . import models
from .config import REPO_ROOT
from .services import nlp
from .services.extraction import find_owner_name, parse_deadline

LABELED = REPO_ROOT / "ml" / "data" / "labeled"
PEOPLE = ["Chanya Shehani", "Dilini Wickrama", "Ravindu Perera", "Nethmi Fernando", "Kasun Silva", "Ishara Jayasuriya"]
BASE = date(2026, 10, 29)


# (speaker, sentence, owner, has a deadline)
PROBE = [
    ("Anna", "Ben will draft the contract before the client call on Monday.", "Ben", True),
    ("Anna", "Priya is going to update the pricing sheet by the end of next week.", "Priya", True),
    ("Ben", "Could Maria Lopez review the security checklist tomorrow?", "Maria Lopez", True),
    ("Chen", "Please ask Tom to renew the SSL certificate by November 30.", "Tom", True),
    ("Dev", "I'm going to migrate the staging database on Thursday night.", "Dev", True),
    ("Anna", "The legal team needs to approve the terms in two weeks.", None, True),
    ("Ben", "Raj has to finish the onboarding guide by the 3rd of December.", "Raj", True),
    ("Chen", "Sofia should send the invoice to the customer this afternoon.", "Sofia", True),
    ("Dev", "Let me check the logs after lunch.", "Dev", True),
    ("Anna", "We expect the vendor to deliver the hardware early next month.", None, True),
    ("Ben", "Ahmed will coordinate the training sessions.", "Ahmed", False),
    ("Chen", "Dev, can you set up the monitoring dashboard before the launch?", "Dev", True),
    ("Dev", "Lucy needs to book the meeting room for Friday morning.", "Lucy", True),
    ("Anna", "Somebody has to call the landlord.", None, False),
    ("Ben", "Kenji is responsible for the release notes due December 12.", "Kenji", True),
    ("Chen", "I will circulate the minutes within two days.", "Chen", True),
]


def _probe(engine: str) -> tuple[int, int]:
    speakers = {s for s, *_ in PROBE}
    owner_ok = deadline_ok = 0
    for speaker, text, gold_owner, has_deadline in PROBE:
        _, name = find_owner_name(text, speaker, [], speakers, engine=engine)
        _, phrase = parse_deadline(text, BASE, engine=engine)
        owner_ok += (name or None) == gold_owner
        deadline_ok += bool(phrase) == has_deadline
    return owner_ok, deadline_ok


def _rows(*names: str) -> list[dict]:
    out = []
    for n in names:
        with (LABELED / n).open(encoding="utf-8") as f:
            out += [r for r in csv.DictReader(f) if r["label"] == "Task"]
    return out


def _deadline_scores(rows: list[dict], engine: str) -> dict:
    tp = fp = fn = contains = 0
    for r in rows:
        _, phrase = parse_deadline(r["text"], BASE, engine=engine)
        gold = (r.get("deadline_span") or "").strip()
        if gold and phrase:
            tp += 1
            contains += gold.lower() in phrase.lower() or phrase.lower() in gold.lower()
        elif gold:
            fn += 1
        elif phrase:
            fp += 1
    p = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * p * rec / (p + rec) if p + rec else 0.0
    return {"precision": p, "recall": rec, "f1": f1, "phrase_ok": contains, "gold": tp + fn}


def _owner_accuracy(rows: list[dict], engine: str, users) -> float:
    speakers = {r["speaker"] for r in rows}
    ok = 0
    for r in rows:
        _, name = find_owner_name(r["text"], r["speaker"], users, speakers, engine=engine)
        got = name.split()[0] if name else ""
        ok += got == (r.get("owner_span") or "").strip()
    return ok / len(rows)


def main() -> int:
    users = [models.User(id=i + 1, name=n, initials="".join(p[0] for p in n.split())) for i, n in enumerate(PEOPLE)]
    indomain = _rows("indomain_v1.csv")
    ami = [r for r in _rows("train_v2.csv", "test_v1.csv")]
    engines = ["rules", "spacy", "hybrid"] if nlp.available() else ["rules"]
    if not nlp.available():
        print("spaCy or en_core_web_sm not installed: only the rule engine is evaluated.\n")

    print(f"In-domain: {len(indomain)} Task utterances | AMI: {len(ami)} Task utterances "
          f"({sum(1 for r in ami if r['deadline_span'])} with a deadline)\n")
    print(f"{'engine':<8} {'owner acc (in-dom)':>18} {'deadline F1 (in-dom)':>21} {'deadline F1 (AMI)':>18} "
          f"{'AMI P / R':>12} {'probe owner':>12} {'probe deadline':>15}")
    for e in engines:
        own = _owner_accuracy(indomain, e, users)
        d_in = _deadline_scores(indomain, e)
        d_ami = _deadline_scores(ami, e)
        po, pd = _probe(e)
        print(f"{e:<8} {own:>18.2f} {d_in['f1']:>21.2f} {d_ami['f1']:>18.2f} "
              f"{d_ami['precision']:>6.2f} / {d_ami['recall']:.2f} {f'{po}/{len(PROBE)}':>12} {f'{pd}/{len(PROBE)}':>15}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
