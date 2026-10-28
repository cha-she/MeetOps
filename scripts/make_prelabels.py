"""
Add weak "pre-labels" to the parsed AMI utterances so manual annotation in
Label Studio starts from a sensible guess instead of a blank.

Two sources, in priority order:

1. AMI summary links (strong signal). AMI annotators wrote an abstractive
   summary per meeting with ACTIONS / DECISIONS / PROBLEMS sections and linked
   each summary sentence to the dialogue acts that support it. We map
       actions   -> Task
       decisions -> Decision
       problems  -> Risk
2. Keyword rules (weak signal) for utterances without a summary link.

Everything else defaults to Other. The output keeps the source and a rough
confidence so the annotation UI can show how much to trust each guess.

Usage
-----
    python scripts/make_prelabels.py
    python scripts/make_prelabels.py --in ml/data/processed/ami_utterances.csv --out ml/data/processed/ami_prelabels.csv
"""

from __future__ import annotations

import argparse
import csv
import re
from collections import Counter
from pathlib import Path

LABELS = ("Task", "Decision", "Risk", "Other")

# Section -> label, applied in guideline priority order (Task > Decision > Risk).
SECTION_LABEL = [("actions", "Task"), ("decisions", "Decision"), ("problems", "Risk")]

# Keyword rules. Patterns are deliberately conservative: a wrong pre-label costs
# more annotation time than a missing one.
RULES: dict[str, re.Pattern[str]] = {
    "Task": re.compile(
        r"\b("
        r"i'?ll (do|take|make|write|send|prepare|check|look|have|get|put|work)|"
        r"i will (do|take|make|write|send|prepare|check|look)|"
        r"i can (do|take|make|write|send|prepare|check|look into)|"
        r"can you (do|make|send|check|prepare|look|put|find|get|write)|"
        r"could you (do|make|send|check|prepare|look|put|find|get|write)|"
        r"you should (do|make|send|check|prepare|look)|"
        r"we (need|have) to (do|make|send|check|prepare|look|find|get|decide|finish|work)|"
        r"let'?s make sure (that )?(we|you|to)|"
        r"action (item|point)s?|"
        r"by (monday|tuesday|wednesday|thursday|friday|tomorrow|next (week|meeting)|the end of|end of)|"
        r"before (the )?next meeting|"
        r"your (task|job|homework) (is|will be)|"
        r"i'?d like you to"
        r")\b"
    ),
    "Decision": re.compile(
        r"\b("
        r"we('ll| will)? go (with|for)|let'?s go (with|for)|go with (the|that|this)|"
        r"agreed|we agree(d)?|that'?s (agreed|settled|decided)|"
        r"we('ve| have)? decided|(the )?decision is|"
        r"so we('re| are) (going to|gonna) (use|have|go|do|make)|"
        r"we('re| are) (not )?(going to|gonna) (use|have|do|make|include)|"
        r"(final|definite) (answer|decision|choice)|"
        r"stick (with|to) (the|that)|"
        r"so (no|yes) (to )?the|"
        r"we'?ll (use|have|keep|drop|include|do) (the|that|a|an)|"
        r"approved|sounds good,? let'?s do (that|it)"
        r")\b"
    ),
    "Risk": re.compile(
        r"\b("
        r"(the |a |one )?(problem|issue|concern|risk|drawback|downside) (is|with|here|there)|"
        r"i'?m (worried|concerned|afraid|not sure)|"
        r"(might|may|could) (not|never) (work|fit|be (able|possible|feasible)|last)|"
        r"won'?t (work|fit|be able|last|have)|"
        r"(too|way too|far too) (expensive|costly|late|slow|heavy|big|complicated|difficult|risky)|"
        r"(over|above|exceed(s|ing)?) (the )?budget|out of budget|"
        r"(we|it) (don'?t|doesn'?t|do not|does not) have (enough|the|any|time)|"
        r"run(ning)? out of (time|money|budget)|"
        r"(miss|missing) (the )?deadline|behind schedule|delay(ed|s)?|"
        r"(not|un)(feasible|realistic|safe|reliable)|"
        r"(dangerous|unsafe|fail(s|ed|ure)?|break(s)?|crash(es)?)"
        r")\b"
    ),
}

CONFIDENCE = {"summlink": 0.8, "rule": 0.5, "default": 0.3}
MIN_WORDS_FOR_LABELLING = 4


def prelabel(row: dict[str, str]) -> tuple[str, str, float, str]:
    """Return (label, source, confidence, matched_text)."""
    sections = set(filter(None, row.get("summary_sections", "").split("|")))
    for section, label in SECTION_LABEL:
        if section in sections:
            return label, "summlink", CONFIDENCE["summlink"], section

    text = row["text"].lower()
    for label in ("Task", "Decision", "Risk"):  # guideline priority order
        m = RULES[label].search(text)
        if m:
            return label, "rule", CONFIDENCE["rule"], m.group(0)
    return "Other", "default", CONFIDENCE["default"], ""


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--in", dest="src", type=Path, default=Path("ml/data/processed/ami_utterances.csv"))
    ap.add_argument("--out", type=Path, default=Path("ml/data/processed/ami_prelabels.csv"))
    args = ap.parse_args(argv)

    with args.src.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        print("input is empty")
        return 1

    counts: Counter[str] = Counter()
    sources: Counter[str] = Counter()
    candidates = 0
    fieldnames = list(rows[0].keys()) + [
        "prelabel", "prelabel_source", "prelabel_confidence", "prelabel_match", "is_candidate",
    ]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for row in rows:
            label, source, conf, match = prelabel(row)
            is_noise = row.get("is_noise") == "1"
            n_words = int(row.get("n_words") or 0)
            # Worth a human's time: real content, or anything the summary links flagged.
            candidate = (not is_noise and n_words >= MIN_WORDS_FOR_LABELLING) or source == "summlink"
            row.update({
                "prelabel": label,
                "prelabel_source": source,
                "prelabel_confidence": f"{conf:.2f}",
                "prelabel_match": match,
                "is_candidate": int(candidate),
            })
            w.writerow(row)
            counts[label] += 1
            sources[source] += 1
            candidates += int(candidate)

    total = len(rows)
    print(f"Pre-labelled {total} utterances -> {args.out}")
    print("  by label : " + ", ".join(f"{k}={counts[k]} ({counts[k] / total:.1%})" for k in LABELS))
    print("  by source: " + ", ".join(f"{k}={v}" for k, v in sources.most_common()))
    print(f"  candidates for manual labelling (content utterances): {candidates}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
