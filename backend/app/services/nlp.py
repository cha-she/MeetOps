"""
spaCy-based owner and deadline extraction.

Two spaCy components are used:

* **Named-entity recognition (NER).** DATE and TIME entities give deadline
  phrases ("next Friday", "the end of the month", "5pm"); PERSON entities give
  names.
* **Dependency parsing.** The owner of an action is the grammatical subject of
  the action verb ("Ishara will check it" -> nsubj = Ishara) or the person
  addressed at the start ("Kasun, can you ..." -> vocative). "I" resolves to the
  speaker. This uses sentence structure, so it also works for names the NER
  model does not know: the small English model labels many Sri Lankan names as
  ORG or GPE instead of PERSON.

The model (``en_core_web_sm``) is loaded once, on first use. If spaCy or the
model is not installed, ``available()`` is False and extraction falls back to
the rule-based extractor in ``extraction.py``.
"""

from __future__ import annotations

import re
from functools import lru_cache

PAST = re.compile(r"\b(last|ago|yesterday|earlier|previous|past|since)\b", re.I)
NOT_DEADLINE = re.compile(r"^(\d+\s*(minutes?|hours?|seconds?)|every\b|each\b|daily|weekly|monthly|annually|"
                          r"forty minutes|two weeks|a week|one week|a day|years?)$", re.I)
PRONOUN_SELF = {"i", "me", "myself"}
PRONOUN_GROUP = {"we", "us", "everyone", "everybody", "someone", "somebody", "team"}
NAME_LABELS = {"PERSON", "ORG", "GPE", "NORP"}   # names the small model often mislabels


@lru_cache(maxsize=1)
def _nlp():
    try:
        import spacy
        return spacy.load("en_core_web_sm", disable=["lemmatizer"])
    except Exception:   # spaCy or the model not installed
        return None


def available() -> bool:
    return _nlp() is not None


def _name_span(tok) -> str:
    """The full name around a proper-noun token (joins compounds: 'Amira Perera')."""
    parts = [t for t in tok.subtree if t.pos_ == "PROPN" or t.dep_ == "compound" or t.i == tok.i]
    parts = [t for t in parts if t.pos_ == "PROPN"] or [tok]
    return " ".join(t.text for t in sorted(parts, key=lambda t: t.i))


MODALS = {"will", "'ll", "ll", "shall", "can", "could", "should", "must", "would", "'d", "gonna"}


def _commits(verb) -> bool:
    """True when the verb is about work still to be done: a modal/future auxiliary, or need/have/going + to."""
    if any(c.dep_ == "aux" and c.lower_ in MODALS for c in verb.children):
        return True
    # "needs to ask", "has to send", "is going to fix" (word forms, the lemmatizer is switched off for speed)
    if verb.lower_ in {"need", "needs", "have", "has", "going", "got", "want", "wants", "plan", "plans"} \
            and any(c.dep_ == "xcomp" for c in verb.children):
        return True
    return False


def owner(text: str, speaker: str | None) -> str | None:
    """Spoken name of the person who should do the work, or None."""
    nlp = _nlp()
    if nlp is None or not text.strip():
        return None
    doc = nlp(text)

    # 1. vocative: "Kasun, can you ..." (a proper noun, then a comma, at the start)
    first = next((t for t in doc if not t.is_punct and t.lower_ not in {"so", "okay", "ok", "and", "yeah", "right"}), None)
    if first is not None and first.pos_ == "PROPN" and first.i + 1 < len(doc) and doc[first.i + 1].text == ",":
        return first.text

    # 2. subject of a verb that expresses future work: "Ishara will check it", "I'll send it", "Nia needs to ..."
    #    (a plain past/present subject is not an owner: "Apple has been taking a week")
    for tok in doc:
        if tok.dep_ in ("nsubj", "nsubjpass") and tok.head.pos_ in ("VERB", "AUX") and _commits(tok.head):
            low = tok.lower_
            if low in PRONOUN_SELF:
                return speaker if speaker and speaker != "Unknown" else None
            if low in PRONOUN_GROUP or low in {"you", "it", "that", "this", "they", "he", "she"}:
                continue
            if tok.pos_ == "PROPN":
                return _name_span(tok)

    # 3. a PERSON entity mentioned with a request or commitment in the sentence
    if any(_commits(t) for t in doc if t.pos_ in ("VERB", "AUX")) or re.search(r"\b(can|could|would|will) you\b|\bplease\b", text, re.I):
        for ent in doc.ents:
            if ent.label_ == "PERSON":
                return ent.text
    return None


def deadline_phrase(text: str) -> str | None:
    """The first future-looking DATE or TIME expression (adjacent DATE+TIME are joined)."""
    nlp = _nlp()
    if nlp is None or not text.strip():
        return None
    doc = nlp(text)
    ents = [e for e in doc.ents if e.label_ in ("DATE", "TIME")]
    for i, e in enumerate(ents):
        if PAST.search(e.text) or NOT_DEADLINE.match(e.text.strip()):
            continue
        # durations ("about forty minutes", "two hours") are not deadlines
        if re.search(r"\b(minutes?|hours?|seconds?)\b", e.text, re.I) and not re.search(r"\bat\b|\d[:.]\d", e.text):
            continue
        start, end = e.start, e.end
        # spaCy sometimes leaves the day outside: "11" + "September 2026"
        if start > 0 and doc[start - 1].like_num and re.match(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", e.text, re.I):
            start -= 1
            if start > 0 and doc[start - 1].lower_ == "the":
                start -= 1
        # join "Friday" + "at 5pm"
        if i + 1 < len(ents) and ents[i + 1].start - end <= 2:
            end = ents[i + 1].end
        # include a preceding "by / before / until / due / on"
        if start > 0 and doc[start - 1].lower_ in {"by", "before", "until", "till", "due", "on"}:
            start -= 1
        return doc[start:end].text
    return None
