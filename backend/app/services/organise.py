"""
Organising layer: from classified utterances to clean register entries.

The classifier works one sentence at a time, but a task is often spread over
an exchange:

    Dilini: And someone needs to update the release notes.     (Task)
    Dilini: Kasun, could you take that?                         (Task)
    Kasun:  Yep, I'll do it.                                    (Task)

That is one task ("Update the release notes", owner Kasun), not three. This
module groups such exchanges, picks the most descriptive sentence as the
title, takes the owner from whoever was asked or accepted, and takes the
deadline from whichever sentence mentions one. It also

* turns vague decisions ("Okay, let's do that.") into readable ones by
  quoting what was agreed (the previous sentence),
* merges near-duplicate tasks inside one meeting,
* decides the review status: confirmed automatically only when the model was
  confident on its own; anything uncertain or changed by a rule is
  "suggested" and waits for a person.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from meetops_ml.preprocessing import clean_text

from .. import models
from ..config import settings
from . import extraction

ACCEPTANCE = re.compile(r"^\W*(yes|yeah|yep|yup|sure|okay|ok|no problem|will do|on it|of course|absolutely|"
                        r"fine|alright|i'?ll (do|take|handle) (it|that|this)|i can do (it|that))\b", re.I)
PRONOUN_REQUEST = re.compile(r"\b(take|do|handle|own|pick up|look at) (that|it|this)\b", re.I)
VAGUE_DECISION = re.compile(r"^\W*(okay|ok|so|right|yeah|yes|alright)?[\s,]*(let'?s (do|go with) (that|it|this)|"
                            r"agreed|deal|sounds good|fine|that works|done)\W*$", re.I)


@dataclass
class Draft:
    kind: str                          # Task | Decision | Risk
    segment: models.Segment            # evidence
    description: str
    confidence: float | None           # model probability; None when the label came from a rule
    rule_changed: bool
    owner: models.User | None = None
    deadline: date | None = None
    deadline_text: str | None = None
    severity: str | None = None
    members: list[models.Segment] = field(default_factory=list)

    @property
    def review_status(self) -> str:
        # Only confident model predictions skip review. Measured on the in-domain set, items at
        # >= 0.8 were all correct; lower thresholds let wrong items through (see ml/README.md 3.8).
        confident = (self.confidence is not None and self.confidence >= settings.auto_confirm_confidence
                     and not self.rule_changed)
        return "confirmed" if confident else "suggested"


def _conf(seg: models.Segment) -> float | None:
    """Model probability for the final label, or None when a rule set the label."""
    return None if seg.rule else float(seg.confidence or 0.0)


def _chain_conf(chain: list[models.Segment]) -> float | None:
    values = [c for c in (_conf(s) for s in chain) if c is not None]
    return max(values) if values else None


def _task_chains(segments: list[models.Segment]) -> list[list[models.Segment]]:
    """Group task sentences that belong to one exchange (request -> acceptance, vague -> named)."""
    chains: list[list[models.Segment]] = []
    for i, seg in enumerate(segments):
        if seg.category != "Task":
            continue
        joined = False
        if chains:
            last = chains[-1][-1]
            gap = seg.position - last.position
            text = seg.text.strip()
            short = len(text.split()) <= 8
            replies = gap <= 2 and (
                (short and ACCEPTANCE.search(text))                     # "Yep, I'll do it."
                or PRONOUN_REQUEST.search(text) and short                # "Kasun, could you take that?"
                or (gap == 1 and last.speaker != seg.speaker and ACCEPTANCE.search(text))
            )
            if replies:
                chains[-1].append(seg)
                joined = True
        if not joined:
            chains.append([seg])
    return chains


def _task_draft(chain: list[models.Segment], meeting_date: date, users: list[models.User]) -> Draft:
    # Title: the first sentence in the exchange that yields a descriptive action
    title, evidence = None, chain[0]
    for seg in chain:
        title = extraction.task_title(seg.text, users)
        if title:
            evidence = seg
            break
    if not title:
        title = extraction.tidy(chain[0].text)

    # Owner: named addressee or first-person speaker; an acceptance by someone else wins
    owner = None
    for seg in chain:
        o = extraction.find_owner(seg.text, seg.speaker, users)
        if o:
            owner = o
    for seg in chain[1:]:
        if ACCEPTANCE.search(seg.text) and seg.speaker:
            owner = extraction.match_user(seg.speaker, users) or owner

    # Deadline: first sentence of the exchange that states one
    deadline, deadline_text = None, None
    for seg in chain:
        d, phrase = extraction.parse_deadline(seg.text, meeting_date)
        if phrase:
            deadline, deadline_text = d, phrase
            break

    return Draft("Task", evidence, title, _chain_conf(chain),
                 any(s.rule for s in chain), owner, deadline, deadline_text, members=chain)


def _merge_duplicates(drafts: list[Draft], threshold: float = 0.7) -> list[Draft]:
    tasks = [d for d in drafts if d.kind == "Task"]
    if len(tasks) < 2:
        return drafts
    X = TfidfVectorizer(ngram_range=(1, 2)).fit_transform(clean_text(d.description) for d in tasks)
    sims = cosine_similarity(X)
    dropped: set[int] = set()
    for i in range(len(tasks)):
        if i in dropped:
            continue
        for j in range(i + 1, len(tasks)):
            if j not in dropped and sims[i, j] >= threshold:
                keep, other = tasks[i], tasks[j]
                keep.owner = keep.owner or other.owner
                if not keep.deadline_text and other.deadline_text:
                    keep.deadline, keep.deadline_text = other.deadline, other.deadline_text
                values = [c for c in (keep.confidence, other.confidence) if c is not None]
                keep.confidence = max(values) if values else None
                keep.rule_changed = keep.rule_changed or other.rule_changed
                dropped.add(j)
    drop_ids = {id(tasks[j]) for j in dropped}
    return [d for d in drafts if id(d) not in drop_ids]


def build_drafts(segments: list[models.Segment], meeting_date: date, users: list[models.User]) -> list[Draft]:
    drafts: list[Draft] = []
    for chain in _task_chains(segments):
        drafts.append(_task_draft(chain, meeting_date, users))

    by_pos = {s.position: s for s in segments}
    for seg in segments:
        if seg.category == "Decision":
            text = extraction.tidy(seg.text)
            prev = by_pos.get(seg.position - 1)
            if VAGUE_DECISION.match(seg.text) and prev is not None:
                agreed = extraction.task_title(prev.text, users) or extraction.tidy(prev.text)
                text = f"Agreed: {agreed[0].lower() + agreed[1:]}"
            owner = extraction.match_user(seg.speaker, users)
            drafts.append(Draft("Decision", seg, text, _conf(seg), bool(seg.rule), owner))
        elif seg.category == "Risk":
            drafts.append(Draft("Risk", seg, extraction.tidy(seg.text), _conf(seg), bool(seg.rule),
                                severity=extraction.risk_severity(seg.text)))
    drafts = _merge_duplicates(drafts)
    drafts.sort(key=lambda d: d.segment.position)
    return drafts
