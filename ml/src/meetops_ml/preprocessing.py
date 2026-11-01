"""
Text preprocessing for meeting transcripts.

Two jobs live here:

1. ``clean_text`` normalises one utterance before it reaches the classifier.
   It is used at training time (on every labelled row) and again at prediction
   time inside the saved model pipeline, so the model always sees text in the
   same shape it was trained on.

2. ``segment_transcript`` turns a plain-text transcript (as uploaded through
   the dashboard) into utterances, one per speaker turn and sentence. The AMI
   corpus already comes segmented, so this is only needed for new transcripts.

Design notes
------------
* Stop words are deliberately *not* removed. In this task the small function
  words carry the signal: "I will", "we should", "can you" are what separate a
  Task from a Decision or a Risk.
* Fillers ("um", "uh", "you know") are removed because they are noise shared
  by every class.
* Contractions are expanded so that "I'll" and "I will" become the same
  feature.
* Spelled-out letters in AMI transcripts ("T_V_", "L_C_D_") are joined into
  words ("tv", "lcd").
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Phrases first (longest match wins), then single tokens.
FILLER_PHRASES = (
    "you know",
    "i mean",
    "mm hmm",
    "uh huh",
)
FILLER_TOKENS = {
    "uh", "um", "umm", "erm", "er", "hmm", "hm", "mm", "mmm", "mhm",
    "ah", "oh", "huh", "eh",
}

CONTRACTIONS = {
    "won't": "will not",
    "can't": "can not",
    "shan't": "shall not",
    "n't": " not",
    "'ll": " will",
    "'re": " are",
    "'ve": " have",
    "'m": " am",
    "'d": " would",
    "gonna": "going to",
    "wanna": "want to",
    "gotta": "got to",
    "kinda": "kind of",
    "sorta": "sort of",
    "'cause": "because",
    "cos": "because",
    "'em": "them",
}

_SPELLED_LETTERS = re.compile(r"\b(?:[A-Za-z]_){1,}")
_REPEATED_WORD = re.compile(r"\b(\w+)(?:\s+\1\b)+")
_NON_WORD = re.compile(r"[^a-z0-9\s]")
_SPACES = re.compile(r"\s+")


def join_spelled_letters(text: str) -> str:
    """'T_V_' -> 'tv', 'V_C_R_' -> 'vcr'."""
    return _SPELLED_LETTERS.sub(lambda m: m.group(0).replace("_", ""), text)


def expand_contractions(text: str) -> str:
    """Expand English contractions and common informal spellings (lowercase input)."""
    # Whole-word forms first so that "won't" is not split as "wo" + " not".
    for short, long in CONTRACTIONS.items():
        if short.startswith("'") or short == "n't":
            continue
        text = re.sub(rf"\b{re.escape(short)}\b", long, text)
    for short, long in CONTRACTIONS.items():
        if short.startswith("'") or short == "n't":
            text = text.replace(short, long)
    return text


def remove_fillers(text: str) -> str:
    """Remove disfluency fillers (lowercase, punctuation-free input)."""
    for phrase in FILLER_PHRASES:
        text = re.sub(rf"\b{phrase}\b", " ", text)
    tokens = [t for t in text.split() if t not in FILLER_TOKENS]
    return " ".join(tokens)


def collapse_repeats(text: str) -> str:
    """'we we have to' -> 'we have to' (stutters and restarts)."""
    return _REPEATED_WORD.sub(r"\1", text)


_TYPOGRAPHIC = str.maketrans({"’": "'", "‘": "'", "ʼ": "'", "`": "'", "“": '"', "”": '"', "„": '"', "–": "-", "—": "-", " ": " "})


def plain_quotes(text: str) -> str:
    """Typographic quotes and dashes (from Word, phones, web pages) to plain ASCII: I’ll -> I'll."""
    return text.translate(_TYPOGRAPHIC)


def clean_text(text: str) -> str:
    """Full normalisation applied to every utterance before vectorising.

    >>> clean_text("Um, I'll check the the T_V_ remote, you know, by Friday.")
    'i will check the tv remote by friday'
    """
    if not isinstance(text, str):
        return ""
    text = plain_quotes(text)
    text = join_spelled_letters(text)
    text = text.lower()
    text = expand_contractions(text)
    text = _NON_WORD.sub(" ", text)
    text = remove_fillers(text)
    text = collapse_repeats(text)
    return _SPACES.sub(" ", text).strip()


def clean_batch(texts) -> list[str]:
    """Vectorised form used inside scikit-learn pipelines."""
    return [clean_text(t) for t in texts]


# ---------------------------------------------------------------------------
# Transcript segmentation (for uploaded transcripts)
# ---------------------------------------------------------------------------

@dataclass
class Utterance:
    speaker: str
    text: str
    start_time: float | None = None


# The reader accepts the layouts produced by people and by meeting tools:
#
#   [00:12:30] Chanya: text          00:40, Amira: “text”         (00:40) Jon - text
#   Chanya (00:12): text             Chanya: text                 CHANYA - text
#   Chanya Shehani   0:12            <- name and time on one line (Teams, Otter),
#   text on the following line(s)       the text follows on the next lines
#   WEBVTT / SRT cue files           <v Chanya>text</v>  or  "Chanya: text" inside cues
#   plain paragraphs                 no speakers: each paragraph is its own turn
#
# Blank lines end a turn. Lines without a speaker continue the current turn.

_TS = r"(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?"
_NAME = r"[A-Za-z][A-Za-z.'\-]*(?:\s+[A-Za-z][A-Za-z.'\-]*){0,3}"
_SEP = r"\s*[:\-–—|]\s*"

_TS_FIRST = re.compile(rf"^\s*[\[(]?(?P<ts>{_TS})[\])]?\s*[,\-–—|:]?\s*(?P<speaker>{_NAME}){_SEP}(?P<text>.+)$")
_NAME_FIRST = re.compile(rf"^\s*(?P<speaker>{_NAME})\s*(?:[\[(]?(?P<ts>{_TS})[\])]?)?{_SEP}(?P<text>.+)$")
_HEADER = re.compile(
    rf"^\s*(?:(?P<speaker>{_NAME})\s*[\[(]?(?P<ts>{_TS})?[\])]?|[\[(]?(?P<ts2>{_TS})[\])]?\s*[,\-–—|]?\s*(?P<speaker2>{_NAME}))\s*:?\s*$"
)
_VTT_TIMING = re.compile(rf"^\s*(?P<ts>{_TS})\s*-->\s*{_TS}")
_VTT_VOICE = re.compile(r"<v(?:\.[^ >]*)?\s+(?P<speaker>[^>]+)>(?P<text>.*?)(?:</v>|$)")
_TAG = re.compile(r"<[^>]+>")

# Words that look like "Speaker:" but introduce content in minutes and notes.
_NOT_SPEAKERS = {
    "note", "notes", "action", "actions", "action item", "action items", "decision", "decisions", "agenda",
    "summary", "update", "updates", "correction", "todo", "to do", "risk", "risks", "issue", "issues",
    "attendees", "participants", "date", "time", "subject", "topic", "minutes", "next steps", "next step",
    "follow up", "follow-up", "re", "fyi", "ps", "q", "a", "question", "answer", "status", "owner", "deadline",
    "webvtt", "kind", "language",
}
_QUOTES = "\"'“”‘’«»"
_ABBREVIATIONS = {"mr", "mrs", "ms", "dr", "prof", "e.g", "i.e", "vs", "etc", "approx", "no", "st", "jr", "sr", "inc", "ltd", "a.m", "p.m"}


def _parse_timestamp(ts: str | None) -> float | None:
    if not ts:
        return None
    ts = ts.replace(",", ".")
    parts = ts.split(":")
    try:
        seconds = float(parts[-1])
        minutes = int(parts[-2]) if len(parts) >= 2 else 0
        hours = int(parts[-3]) if len(parts) >= 3 else 0
    except ValueError:
        return None
    return float(hours * 3600 + minutes * 60 + int(seconds))


def _valid_speaker(name: str | None) -> bool:
    if not name:
        return False
    n = name.strip()
    return 0 < len(n) <= 40 and n.lower().rstrip(".") not in _NOT_SPEAKERS and not re.search(r"\d", n)


def _strip_quotes(text: str) -> str:
    t = _TAG.sub("", text).strip()
    while len(t) >= 2 and t[0] in _QUOTES and t[-1] in _QUOTES:
        t = t[1:-1].strip()
    # a lone opening or closing quote left over after a line break
    if t[:1] in _QUOTES and not any(q in t[1:] for q in _QUOTES):
        t = t[1:].strip()
    if t[-1:] in _QUOTES and not any(q in t[:-1] for q in _QUOTES):
        t = t[:-1].strip()
    return t


def split_sentences(text: str) -> list[str]:
    """Split on . ! ? (or …), also when followed by a closing quote; keep abbreviations together."""
    out, start = [], 0
    for m in re.finditer(r"[.!?…]+[\"'”’)\]]*\s+", text):
        prev_word = re.findall(r"([A-Za-z.]+)[.!?…]*[\"'”’)\]]*\s+$", text[start:m.end()])
        nxt = text[m.end():m.end() + 1]
        if prev_word and prev_word[-1].lower().rstrip(".") in _ABBREVIATIONS:
            continue
        if nxt and not (nxt.isupper() or nxt.isdigit() or nxt in _QUOTES + "(["):
            continue
        out.append(text[start:m.end()].strip())
        start = m.end()
    tail = text[start:].strip()
    if tail:
        out.append(tail)
    return [s for s in (_strip_quotes(x) for x in out) if s]


def _match_turn(line: str) -> tuple[str, str, float | None] | None:
    """(speaker, text, start) if the line opens a speaker turn with text on the same line."""
    voice = _VTT_VOICE.search(line)
    if voice and _valid_speaker(voice.group("speaker")):
        return voice.group("speaker").strip(), voice.group("text"), None
    for rx in (_TS_FIRST, _NAME_FIRST):
        m = rx.match(line)
        if m and _valid_speaker(m.group("speaker")):
            return m.group("speaker").strip(), m.group("text"), _parse_timestamp(m.group("ts"))
    return None


def _match_header(line: str) -> tuple[str, float | None] | None:
    """(speaker, start) if the line holds only a speaker name and/or a time (Teams, Otter exports)."""
    m = _HEADER.match(line)
    if not m:
        return None
    speaker = m.group("speaker") or m.group("speaker2")
    ts = m.group("ts") or m.group("ts2")
    if not _valid_speaker(speaker) or (ts is None and not line.rstrip().endswith(":")):
        return None   # a bare word on its own line is text, not a speaker
    return speaker.strip(), _parse_timestamp(ts)


def segment_transcript(raw: str, min_words: int = 1) -> list[Utterance]:
    """Split a transcript (any of the layouts above) into one utterance per sentence.

    One utterance holds one idea, which is the unit the classifier was trained
    on. Fragments shorter than ``min_words`` are dropped.
    """
    raw = plain_quotes(raw.replace("﻿", "").replace("\r\n", "\n"))
    turns: list[Utterance] = []
    current: Utterance | None = None
    pending: tuple[str, float | None] | None = None   # header line waiting for its text
    cue_time: float | None = None                       # time from a VTT/SRT timing line

    def close():
        nonlocal current
        if current and current.text.strip():
            turns.append(current)
        current = None

    for line in raw.split("\n"):
        stripped = line.strip()
        if not stripped:
            close()
            continue
        if stripped.upper().startswith("WEBVTT") or stripped.upper().startswith(("NOTE ", "STYLE", "REGION")):
            continue
        timing = _VTT_TIMING.match(stripped)
        if timing:
            close()
            cue_time = _parse_timestamp(timing.group("ts"))
            continue
        if stripped.isdigit() and len(stripped) <= 6:   # SRT / VTT cue number
            continue

        turn = _match_turn(stripped)
        if turn:
            close()
            speaker, text, start = turn
            current = Utterance(speaker, text.strip(), start if start is not None else cue_time)
            pending, cue_time = None, None
            continue
        header = _match_header(stripped)
        if header:
            close()
            pending = header
            continue

        text = _TAG.sub("", stripped)
        if current is None:
            speaker, start = pending if pending else ("Unknown", None)
            current = Utterance(speaker, text, start if start is not None else cue_time)
            cue_time = None
        else:
            current.text += " " + text
    close()

    utterances: list[Utterance] = []
    for turn in turns:
        for sentence in split_sentences(_strip_quotes(turn.text)):
            if len(sentence.split()) >= min_words:
                utterances.append(Utterance(turn.speaker, sentence, turn.start_time))
    return utterances
