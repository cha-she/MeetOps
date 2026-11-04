"""
Who is "Speaker 2"? Name suggestions for the numbered speakers of a recording.

People in meetings name each other, so the conversation itself usually says who is who:

* "Hi Kasun, thanks for joining."  "OK Ravindu, let's ..."  "Kasun, can you ...?"
      someone is addressed: the next different speaker is probably that person
* "Thanks, Kasun."  "Talk soon, Nethmi."  (or "Kasun." on its own line)
      addressed at the end: with two speakers, it is the other one
* "I'm Kasun"  "This is Kasun"  "My name is Kasun"
      the speaker introduces themself

Every clue is a vote; each name goes to the speaker with the most votes, one name per speaker.
These are suggestions only: a person confirms them on the meeting page.
"""

from __future__ import annotations

import re
from collections import defaultdict

from .. import models
from .extraction import is_speaker_number, match_user

# greetings and lead words in any case; the name itself must be capitalised ("Kasun", not "fine")
_GREETING = r"(?i:hi|hello|hey|ok|okay|so|right|alright|thanks|thank you|good (?:morning|afternoon|evening)|morning|well)"
_NAME = r"([A-Z][a-z]{1,20})"
# "Hi Kasun," / "OK Ravindu, let's" (a greeting first), or "Kasun, can you" (a request follows)
ADDRESS_START = re.compile(rf"^\W*(?:{_GREETING}[\s,]+{_NAME}\b(?=\s*[,!?.])"
                           rf"|{_NAME},\s+(?i:can|could|would|will|please|do|did|are|what|how|when)\b)")
ADDRESS_END = re.compile(rf",\s*{_NAME}\s*[.!?]*$")
NAME_ALONE = re.compile(rf"^\W*{_NAME}\W*$")
SELF = re.compile(rf"\b(?i:i'?m|i am|this is|my name is)\s+{_NAME}\b(?=\s*(?:[,.!?]|$|here\b|from\b|speaking\b))")

NOT_NAMES = {"everyone", "everybody", "all", "guys", "team", "folks", "sir", "madam", "there", "sure", "okay", "yes",
             "no", "great", "good", "right", "well", "thanks", "perfect", "sorry", "hello", "hi", "hey", "morning",
             "afternoon", "evening", "actually", "also", "and", "but", "now", "then", "let", "alright", "fine", "cool",
             "agreed", "exactly", "really", "just", "here", "back", "done", "ready", "sorry"}


def _as_name(word: str | None, users: list[models.User], known_only: bool) -> str | None:
    """A spoken first name as the account's full name, or as said when nobody has that name."""
    if not word or word.lower() in NOT_NAMES:
        return None
    account = match_user(word, users)
    if account:
        return account.name
    return None if known_only else word[0].upper() + word[1:].lower()


def suggest_names(segments: list[models.Segment], users: list[models.User]) -> dict[str, tuple[str, str]]:
    """{speaker label: (suggested name, the line it was heard in)} for the numbered speakers."""
    labels = list(dict.fromkeys(s.speaker for s in segments if is_speaker_number(s.speaker)))
    if not labels:
        return {}
    votes: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    evidence: dict[tuple[str, str], str] = {}

    def vote(label: str | None, name: str | None, weight: float, line: str) -> None:
        if label and name and is_speaker_number(label):
            votes[label][name] += weight
            evidence.setdefault((label, name), line)

    def next_other(i: int) -> str | None:
        for s in segments[i + 1:]:
            if s.speaker != segments[i].speaker:
                return s.speaker
        return None

    def the_other(label: str | None) -> str | None:
        others = [l for l in labels if l != label]
        return others[0] if len(labels) == 2 and others else None

    for i, s in enumerate(segments):
        text = (s.text or "").strip()
        m = SELF.search(text)
        if m:
            vote(s.speaker, _as_name(m.group(1), users, known_only=False), 3, text)
        m = ADDRESS_START.search(text)
        if m:
            greeted = m.group(1) is not None
            name = _as_name(m.group(1) or m.group(2), users, known_only=not greeted)
            vote(next_other(i), name, 2, text)
            vote(the_other(s.speaker), name, 1, text)
        m = ADDRESS_END.search(text)
        if m:
            vote(the_other(s.speaker), _as_name(m.group(1), users, known_only=False), 2, text)
        m = NAME_ALONE.match(text)
        if m and i > 0 and segments[i - 1].speaker == s.speaker:     # "Thanks." / "Kasun."
            vote(the_other(s.speaker), _as_name(m.group(1), users, known_only=True), 2, f"{segments[i - 1].text} {text}")

    ranked = sorted(((w, label, name) for label, names in votes.items() for name, w in names.items()), reverse=True)
    out: dict[str, tuple[str, str]] = {}
    taken: set[str] = set()
    for w, label, name in ranked:
        if label in out or name in taken:
            continue
        out[label] = (name, evidence[(label, name)])
        taken.add(name)
    return out
