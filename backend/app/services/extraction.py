"""
Information extraction v1: owner, deadline, risk severity and recurrence.

Rule-based on purpose. The utterances are short and the vocabulary of
commitments is small ("I'll", "can you", "by Friday"), so explicit rules are
transparent, fast and easy to evaluate against the ``owner_span`` and
``deadline_span`` columns of the labelled data. A statistical extractor
(spaCy NER) is the planned upgrade once more spans are labelled.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

import dateparser

from .. import models

FIRST_PERSON = re.compile(r"\b(i will|i'll|i can|i could|i am going to|i'm going to|let me|i'd|i would|i take|i'll take|i'm on it)\b", re.I)
SECOND_PERSON = re.compile(r"\b(can you|could you|would you|you need to|you should|you'll|you will|your job)\b", re.I)

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

DEADLINE_PATTERNS = [
    r"\b(?:by|before|until|till|due|on)\s+(?:the\s+)?(?:end of\s+)?(?:this|next|coming)?\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|week|month|sprint|quarter|tomorrow|today|tonight)\b",
    r"\b(?:by|before)\s+(?:the\s+)?next\s+(?:meeting|standup|stand-up|sprint|review|session|call)\b",
    r"\bend of (?:the\s+)?(?:day|week|month|sprint|quarter)\b",
    r"\b(?:this|next)\s+(?:week|month|sprint|monday|tuesday|wednesday|thursday|friday)\b",
    r"\bin\s+(?:a|an|one|two|three|four|five|\d+)\s+(?:day|days|week|weeks|month|months)\b",
    r"\b(?:within|in)\s+(?:a|the)\s+(?:day|week|month|fortnight)\b",
    r"\btomorrow\b|\btoday\b|\btonight\b|\bthis afternoon\b|\bthis evening\b",
    r"\b(?:by|before|on)\s+(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b",
    r"\b(?:by|before|on)\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?\b",
    r"\b\d{4}-\d{2}-\d{2}\b",
]
_DEADLINE = re.compile("|".join(f"(?:{p})" for p in DEADLINE_PATTERNS), re.I)

HIGH = re.compile(r"\b(deadline|budget|over budget|block|blocked|blocker|critical|fail|fails|failed|impossible|miss|missed|lose|losing|serious|can'?t afford|will not work|won'?t work|slip|slips)\b", re.I)
MEDIUM = re.compile(r"\b(problem|problems|issue|expensive|costly|late|slow|not sure|unsure|might|may|worried|worry|concern|concerned|difficult|hard|risk|risky|fragile|break)\b", re.I)


@dataclass
class TaskFields:
    owner: models.User | None
    deadline: date | None
    deadline_text: str | None


def find_person(text: str, speaker: str | None, users: list[models.User]) -> models.User | None:
    """Owner = a participant named in the text; else the speaker for first-person commitments."""
    lowered = text.lower()
    for u in users:
        first = u.name.split()[0].lower()
        if re.search(rf"\b{re.escape(first)}\b", lowered):
            return u
    if FIRST_PERSON.search(text) and speaker:
        return match_user(speaker, users)
    return None


def match_user(speaker: str | None, users: list[models.User]) -> models.User | None:
    if not speaker:
        return None
    s = speaker.strip().lower()
    for u in users:
        if s == u.name.lower() or s == u.name.split()[0].lower() or s == u.initials.lower():
            return u
    return None


def _next_weekday(base: date, weekday: int, strictly_after: bool = True) -> date:
    days = (weekday - base.weekday()) % 7
    if days == 0 and strictly_after:
        days = 7
    return base + timedelta(days=days)


def parse_deadline(text: str, base: date) -> tuple[date | None, str | None]:
    """Return (date, matched phrase). Relative phrases are resolved from the meeting date."""
    m = _DEADLINE.search(text)
    if not m:
        return None, None
    phrase = m.group(0)
    p = phrase.lower()

    # Hand-resolved phrases that date parsers get wrong or do not understand.
    if "weekend" in p:
        return _next_weekday(base, 5, strictly_after=False), phrase
    if "end of" in p or p.startswith(("by the end", "before the end")):
        if "day" in p or "today" in p:
            return base, phrase
        if "week" in p:
            return _next_weekday(base, 4, strictly_after=False), phrase
        if "month" in p:
            nxt = (base.replace(day=28) + timedelta(days=4)).replace(day=1)
            return nxt - timedelta(days=1), phrase
        if "sprint" in p or "quarter" in p:
            return base + timedelta(days=14 if "sprint" in p else 90), phrase
    if "next meeting" in p or "standup" in p or "stand-up" in p or "next session" in p or "next call" in p or "next review" in p:
        return base + timedelta(days=7), phrase
    if "next sprint" in p:
        return base + timedelta(days=14), phrase
    if re.search(r"\bthis week\b", p):
        return _next_weekday(base, 4, strictly_after=False), phrase
    if re.search(r"\bnext week\b", p):
        return base + timedelta(days=7), phrase
    if re.search(r"\b(this|next) month\b", p):
        return base + timedelta(days=30), phrase

    parsed = dateparser.parse(
        re.sub(r"^(by|before|until|till|due|on)\s+", "", p),
        settings={"RELATIVE_BASE": datetime.combine(base, time.min),
                  "PREFER_DATES_FROM": "future", "PREFER_DAY_OF_MONTH": "first"},
    )
    return (parsed.date() if parsed else None), phrase


def task_fields(text: str, speaker: str | None, meeting_date: date, users: list[models.User]) -> TaskFields:
    deadline, phrase = parse_deadline(text, meeting_date)
    return TaskFields(owner=find_person(text, speaker, users), deadline=deadline, deadline_text=phrase)


def risk_severity(text: str) -> str:
    if HIGH.search(text):
        return "High"
    if MEDIUM.search(text):
        return "Medium"
    return "Low"


def tidy(text: str, limit: int = 240) -> str:
    """Make an utterance presentable as a record description."""
    t = re.sub(r"^\W*(okay|ok|so|um|uh|well|yeah|right|and|but|then)[,\s]+", "", text.strip(), flags=re.I)
    t = re.sub(r"\s+", " ", t).strip()
    if t:
        t = t[0].upper() + t[1:]
    if len(t) > limit:
        t = t[: limit - 1].rstrip() + "…"
    return t or text
