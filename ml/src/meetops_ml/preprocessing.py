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


def clean_text(text: str) -> str:
    """Full normalisation applied to every utterance before vectorising.

    >>> clean_text("Um, I'll check the the T_V_ remote, you know, by Friday.")
    'i will check the tv remote by friday'
    """
    if not isinstance(text, str):
        return ""
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


# "[00:12:30] Chanya: text", "00:12 Chanya: text", "Chanya: text", "CHANYA - text"
_TURN = re.compile(
    r"^\s*(?:\[?(?P<ts>\d{1,2}:\d{2}(?::\d{2})?)\]?\s*)?"
    r"(?P<speaker>[A-Za-z][A-Za-z .'\-]{0,40}?)\s*[:\-–]\s+(?P<text>.+)$"
)
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"'(\[])")


def _parse_timestamp(ts: str | None) -> float | None:
    if not ts:
        return None
    parts = [int(p) for p in ts.split(":")]
    while len(parts) < 3:
        parts.insert(0, 0)
    h, m, s = parts
    return float(h * 3600 + m * 60 + s)


def segment_transcript(raw: str, min_words: int = 2) -> list[Utterance]:
    """Split a plain-text transcript into utterances.

    Speaker turns are recognised from "Speaker: text" lines (with an optional
    leading timestamp). Lines without a speaker continue the previous turn.
    Each turn is then split into sentences so that one utterance holds one
    idea, which is the unit the classifier was trained on. Fragments shorter
    than ``min_words`` are dropped.
    """
    turns: list[Utterance] = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        m = _TURN.match(line)
        if m:
            turns.append(Utterance(m.group("speaker").strip(), m.group("text").strip(),
                                   _parse_timestamp(m.group("ts"))))
        elif turns:
            turns[-1].text += " " + line.strip()
        else:
            turns.append(Utterance("Unknown", line.strip()))

    utterances: list[Utterance] = []
    for turn in turns:
        for sentence in _SENTENCE_SPLIT.split(turn.text):
            sentence = sentence.strip()
            if len(sentence.split()) >= min_words:
                utterances.append(Utterance(turn.speaker, sentence, turn.start_time))
    return utterances
