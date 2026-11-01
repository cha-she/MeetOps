"""
Information extraction v1: owner, deadline, titles, risk severity.

Rule-based on purpose. Commitments in meetings use a small vocabulary
("I'll", "can you", "by Friday"), so explicit rules are transparent, fast and
easy to evaluate against the ``owner_span`` and ``deadline_span`` columns of
the labelled data. A statistical extractor (spaCy NER) is the planned upgrade
once more spans are labelled.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

import dateparser

from .. import models
from ..config import settings
from . import nlp

FIRST_PERSON = re.compile(r"\b(i will|i'll|i can|i could|i am going to|i'm going to|i'm gonna|let me|i'd|i would|"
                          r"i take|i'm on it|i'll have|i can have)\b", re.I)

ORDINALS = {"first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6, "seventh": 7, "eighth": 8,
            "ninth": 9, "tenth": 10, "eleventh": 11, "twelfth": 12, "thirteenth": 13, "fourteenth": 14,
            "fifteenth": 15, "sixteenth": 16, "seventeenth": 17, "eighteenth": 18, "nineteenth": 19,
            "twentieth": 20, "twenty-first": 21, "twenty first": 21, "twenty-second": 22, "twenty second": 22,
            "twenty-third": 23, "twenty third": 23, "twenty-fourth": 24, "twenty-fifth": 25, "thirtieth": 30,
            "thirty-first": 31}
_ORD = "|".join(sorted((re.escape(k) for k in ORDINALS), key=len, reverse=True))

_MONTH = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*"
_YEAR = r"(?:,?\s+\d{4})?"
_TIME = r"(?:,?\s+(?:at\s+)?\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?(?:\s*(?:utc|gmt|ist|sl time|local time))?)?"
_LEAD = r"(?:by|before|until|till|due|on|no later than)"

DEADLINE_PATTERNS = [
    # explicit calendar dates first, with optional year and time: "by 11 September 2026 at 14:00 UTC"
    rf"\b{_LEAD}\s+(?:the\s+)?\d{{1,2}}(?:st|nd|rd|th)?(?:\s+of)?\s+{_MONTH}{_YEAR}{_TIME}",
    rf"\b{_LEAD}\s+{_MONTH}\s+\d{{1,2}}(?:st|nd|rd|th)?{_YEAR}{_TIME}",
    rf"\b{_LEAD}\s+\d{{1,2}}[/.-]\d{{1,2}}[/.-]\d{{2,4}}{_TIME}",
    r"\b\d{4}-\d{2}-\d{2}\b",
    r"\b(?:by|before|until|till|due|on)\s+(?:the\s+)?(?:end of\s+)?(?:this|next|coming)?\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|week|month|sprint|quarter|tomorrow|today|tonight)(?:\s+(?:morning|afternoon|evening))?\b",
    r"\b(?:by|before)\s+(?:the\s+)?next\s+(?:meeting|standup|stand-up|sprint|review|session|call)\b",
    r"\b(?:by|before|on)\s+the\s+(?:" + _ORD + r"|\d{1,2}(?:st|nd|rd|th)?)(?:\s+at the latest)?\b",
    r"\bbefore\s+(?:the\s+)?(?:go-live|launch|release|freeze|deadline|demo|review|sending)\b",
    r"\bend of (?:the\s+)?(?:day|week|month|sprint|quarter)\b",
    r"\b(?:this|next)\s+(?:week|month|sprint|monday|tuesday|wednesday|thursday|friday)\b",
    r"\bin\s+(?:a|an|one|two|three|four|five|\d+)\s+(?:day|days|week|weeks|month|months)\b",
    r"\bafter (?:this|the) (?:call|meeting)\b",
    r"\b(?:by |for |at |in )?(?:the )?next (?:meeting|time|session)\b",
    r"\bbefore (?:lunch|the break|the end of (?:the )?(?:meeting|call))\b",
    r"\btomorrow\b|\btoday\b|\btonight\b|\bthis afternoon\b|\bthis evening\b",
]
_DEADLINE = re.compile("|".join(f"(?:{p})" for p in DEADLINE_PATTERNS), re.I)

HIGH = re.compile(r"\b(deadline|budget|over budget|block|blocked|blocker|critical|outage|down|data loss|security|"
                  r"fail|fails|failed|impossible|miss|missed|lose|losing|serious|can'?t afford|won'?t have|"
                  r"will not work|won'?t work|slip|slips|go unnoticed|nobody|in time|go-live|launch)\b|"
                  r"\b(not|n'?t)\b.{0,40}\bbe ready\b", re.I)
MEDIUM = re.compile(r"\b(problem|problems|issue|expensive|costly|late|slow|not sure|unsure|might|may|worr\w*|"
                    r"concern\w*|difficult|hard|risk|risky|fragile|break|tight|never tested|untested|gap)\b", re.I)


@dataclass
class TaskFields:
    owner: models.User | None
    deadline: date | None
    deadline_text: str | None


def match_user(name: str | None, users: list[models.User]) -> models.User | None:
    """Match a speaker label or a spoken name to an account (full name, first name or initials)."""
    if not name:
        return None
    s = name.strip().lower()
    for u in users:
        if s in (u.name.lower(), u.name.split()[0].lower(), u.initials.lower()):
            return u
    return None


def named_user(text: str, users: list[models.User]) -> models.User | None:
    """A participant addressed or mentioned by first name in the sentence."""
    lowered = text.lower()
    for u in users:
        if re.search(rf"\b{re.escape(u.name.split()[0].lower())}\b", lowered):
            return u
    return None


def find_owner(text: str, speaker: str | None, users: list[models.User]) -> models.User | None:
    """Owner = a participant named in the text; else the speaker for first-person commitments."""
    named = named_user(text, users)
    if named:
        return named
    if FIRST_PERSON.search(text):
        return match_user(speaker, users)
    return None


def find_owner_name(text: str, speaker: str | None, users: list[models.User],
                    speakers: set[str] | None = None, engine: str | None = None) -> tuple[models.User | None, str | None]:
    """(account, spoken name) of the person who should do the work.

    engine "rules": patterns only; "spacy": spaCy dependency parse + NER only;
    "hybrid" (default): rules first, spaCy for what they do not find.
    """
    engine = engine or settings.extraction_engine
    if engine == "spacy" and nlp.available():
        return _spacy_owner(text, speaker, users)
    found = _rule_owner_name(text, speaker, users, speakers)
    if found == (None, None) and engine == "hybrid" and nlp.available():
        return _spacy_owner(text, speaker, users)
    return found


def _spacy_owner(text: str, speaker: str | None, users: list[models.User]) -> tuple[models.User | None, str | None]:
    name = nlp.owner(text, speaker)
    if not name:
        return None, None
    user = match_user(name, users) or match_user(name.split()[0], users)
    return user, user.name if user else name


def _rule_owner_name(text: str, speaker: str | None, users: list[models.User],
                     speakers: set[str] | None = None) -> tuple[models.User | None, str | None]:
    """Rule-based owner: an account named in the text, a speaker's name, a vocative, or "I'll" = speaker.

    Works also when people in the transcript have no account: a name addressed in the sentence
    ("Jon, can you …", "Nia will …") or the speaker of "I'll …" is returned as the spoken name.
    """
    user = find_owner(text, speaker, users)
    if user:
        return user, user.name
    names = {s for s in (speakers or set()) if s and s != "Unknown"}
    # addressed or mentioned by name: "Jon, can you …", "… and Nia will check it"
    for name in sorted(names, key=len, reverse=True):
        first = name.split()[0]
        if re.search(rf"\b{re.escape(first)}\b", text) and (name != speaker or text.strip().startswith(first)):
            return match_user(name, users), name
    vocative = re.match(r"^\W*([A-Z][a-z]+),\s+(can|could|would|will|please)\b", text)
    if vocative:
        return None, vocative.group(1)
    if FIRST_PERSON.search(text) and speaker and speaker != "Unknown":
        return match_user(speaker, users), speaker
    return None, None


def _next_weekday(base: date, weekday: int, strictly_after: bool = True) -> date:
    days = (weekday - base.weekday()) % 7
    if days == 0 and strictly_after:
        days = 7
    return base + timedelta(days=days)


def _day_of_month(base: date, day: int) -> date:
    """The next date with this day of the month, on or after the meeting date."""
    y, m = base.year, base.month
    for _ in range(13):
        try:
            d = date(y, m, day)
            if d >= base:
                return d
        except ValueError:
            pass
        m = 1 if m == 12 else m + 1
        y = y + 1 if m == 1 else y
    return base


def parse_deadline(text: str, base: date, engine: str | None = None) -> tuple[date | None, str | None]:
    """Return (date, phrase). The phrase comes from the rules, spaCy NER, or both (``EXTRACTION_ENGINE``);
    relative phrases are resolved from the meeting date."""
    engine = engine or settings.extraction_engine
    phrase = None
    if engine != "spacy" or not nlp.available():
        m = _DEADLINE.search(text)
        phrase = m.group(0).strip(" ,") if m else None
    if phrase is None and engine in ("spacy", "hybrid") and nlp.available():
        phrase = nlp.deadline_phrase(text)
    if not phrase:
        return None, None
    return resolve_deadline(phrase, base), phrase


def resolve_deadline(phrase: str, base: date) -> date | None:
    """Turn a time phrase into a calendar date, relative to the meeting date (None if it names an event)."""
    p = phrase.lower()

    # Explicit calendar dates: respect a spoken year; without one, take the next such date.
    date_part = re.sub(rf"^{_LEAD}\s+(the\s+)?", "", p)
    date_part = re.sub(r"(,?\s+(at\s+)?\d{1,2}([:.]\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?(\s*(utc|gmt|ist|sl time|local time))?)$", "", date_part)
    if re.search(_MONTH, date_part) and re.search(r"\d", date_part) or re.fullmatch(r"\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}", date_part) \
            or re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_part):
        has_year = bool(re.search(r"\d{4}", date_part))
        settings = {"DATE_ORDER": "DMY", "PREFER_DAY_OF_MONTH": "first",
                    "RELATIVE_BASE": datetime.combine(base, time.min)}
        if not has_year:
            settings["PREFER_DATES_FROM"] = "future"
        parsed = dateparser.parse(date_part, settings=settings)
        if parsed:
            return parsed.date()

    ordinal = re.search(_ORD, p)
    numeric = re.search(r"\bthe (\d{1,2})(st|nd|rd|th)?\b", p)
    if ordinal and "the" in p and not re.search(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", p):
        return _day_of_month(base, ORDINALS[ordinal.group(0)])
    if numeric and not re.search(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", p):
        return _day_of_month(base, int(numeric.group(1)))
    if "weekend" in p:
        return _next_weekday(base, 5, strictly_after=False)
    if "after this call" in p or "after the call" in p or "after the meeting" in p or "after this meeting" in p:
        return base
    if "end of" in p:
        if "day" in p:
            return base
        if "week" in p:
            return _next_weekday(base, 4, strictly_after=False)
        if "month" in p:
            nxt = (base.replace(day=28) + timedelta(days=4)).replace(day=1)
            return nxt - timedelta(days=1)
        return base + timedelta(days=90 if "quarter" in p else 14)
    if re.search(r"next (meeting|standup|stand-up|session|call|review|time)", p):
        return base + timedelta(days=7)
    if re.search(r"before (lunch|the break|the end of)", p):
        return base
    if "next sprint" in p:
        return base + timedelta(days=14)
    if re.search(r"\bthis week\b", p):
        return _next_weekday(base, 4, strictly_after=False)
    if re.search(r"\bnext week\b", p):
        return _next_weekday(base, 0) + timedelta(days=4)   # Friday of next week
    if re.search(r"\b(this|next) month\b", p):
        return base + timedelta(days=30)
    if re.search(r"before (the )?(go-live|launch|release|freeze|deadline|demo|review|sending)", p):
        return None   # relative to an event: keep the text, no date
    for i, day in enumerate(("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")):
        if day in p:
            return _next_weekday(base, i)   # the coming <day>, after the meeting date
    if "tomorrow" in p:
        return base + timedelta(days=1)
    if any(w in p for w in ("today", "tonight", "this afternoon", "this evening")):
        return base

    parsed = dateparser.parse(re.sub(r"^(by|before|until|till|due|on)\s+", "", p),
                              settings={"RELATIVE_BASE": datetime.combine(base, time.min),
                                        "PREFER_DATES_FROM": "future", "PREFER_DAY_OF_MONTH": "first"})
    return (parsed.date() if parsed else None)


def task_fields(text: str, speaker: str | None, meeting_date: date, users: list[models.User]) -> TaskFields:
    deadline, phrase = parse_deadline(text, meeting_date)
    return TaskFields(owner=find_owner(text, speaker, users), deadline=deadline, deadline_text=phrase)


def risk_severity(text: str) -> str:
    if HIGH.search(text):
        return "High"
    if MEDIUM.search(text):
        return "Medium"
    return "Low"


# --------------------------------------------------------------------------
# Turning utterances into readable register entries
# --------------------------------------------------------------------------

LEAD_IN = re.compile(r"^\W*((okay|ok|so|um|uh|hmm|mm|well|yeah|yes|yep|sure|right|alright|and|but|then|also|great|"
                     r"good point|sounds good|agreed|honestly|actually|just a thought|one more thing)\b[\s,.!:-]*)+", re.I)
REQUEST_LEAD = re.compile(r"^(can|could|would|will) you\s+(please\s+)?|^please\s+", re.I)
COMMIT_LEAD = re.compile(r"^(i'?ll|i will|i can|i could|i'?m going to|i am going to|i'?m gonna|let me|we need to|"
                         r"we have to|we should|we'?ll|we will|someone needs to|somebody needs to|someone has to|"
                         r"let'?s make sure( that)?|let'?s)\s+(also\s+)?(just\s+)?", re.I)
VAGUE = re.compile(r"^(do it|do that|take that|take it|handle it|handle that|that|it|on it)\W*$", re.I)


def tidy(text: str, limit: int = 240) -> str:
    """Remove discourse lead-ins ("Okay, so ...") and capitalise."""
    t = re.sub(r"\b(um+|uh+|erm)\b[,.]?\s*", "", text.strip(), flags=re.I)
    t = LEAD_IN.sub("", t)
    t = re.sub(r"\s+", " ", t).strip()
    if t:
        t = t[0].upper() + t[1:]
    if len(t) > limit:
        t = t[: limit - 1].rstrip() + "…"
    return t or text.strip()


def task_title(text: str, users: list[models.User]) -> str | None:
    """An action-style title: 'Kasun, can you write up the timeline by Wednesday?' -> 'Write up the timeline'.

    Returns None when nothing descriptive is left (e.g. "Yep, I'll do it."), so the caller can use
    another utterance from the same exchange.
    """
    t = re.sub(r"\b(um+|uh+|erm)\b[,.]?\s*", "", text.strip(), flags=re.I)
    t = LEAD_IN.sub("", t)
    # vocative name at the start: "Kasun, ..."
    first_names = {u.name.split()[0].lower() for u in users}
    m = re.match(r"^([A-Z][a-z]+)\s*,\s*", t)
    if m and m.group(1).lower() in first_names:
        t = t[m.end():]
    t = LEAD_IN.sub("", t)
    t = REQUEST_LEAD.sub("", t)
    make_sure = re.match(r"^(let'?s |we need to |we should )?make sure (that )?", t, re.I)
    t = t[make_sure.end():] if make_sure else COMMIT_LEAD.sub("", t)
    t = _DEADLINE.sub("", t).strip(" ,.?!")
    # "have a first version of the script ready" -> "Finish a first version of the script"
    if re.match(r"^(have|get)\s+.*\b(ready|done|finished)$", t, re.I):
        t = "Finish " + re.sub(r"\s+(ready|done|finished)$", "", re.sub(r"^(have|get)\s+", "", t, flags=re.I), flags=re.I)
    # "have it in the wiki" -> "Put it in the wiki"
    t = re.sub(r"^have (it|that|this)\b", r"Put \1", t, flags=re.I)
    t = re.sub(r"\s*,\s*(that|which) would .*$", "", t, flags=re.I)   # drop justification clauses
    t = re.sub(r"\s*,\s*i'?ve done it .*$", "", t, flags=re.I)
    t = re.sub(r"\s+(at the latest|as well|too)\s*$", "", t.strip(" ,.?!"), flags=re.I)
    t = re.sub(r"\s+(for|by|on|in|at|to|before|until|within)\s*$", "", t.strip(" ,.?!"), flags=re.I)  # dangling
    t = re.sub(r"\s+", " ", t).strip(" ,.?!;:-")
    if not t or VAGUE.match(t) or len(t.split()) < 2:
        return None
    t = ("Make sure " + t[0].lower() + t[1:]) if make_sure else (t[0].upper() + t[1:])
    return t if len(t) <= 200 else t[:199].rstrip() + "…"
