"""
Rule layer applied after the classifier (hybrid classification).

The statistical model proposes a label; these rules then correct the cases
where the annotation guideline gives an explicit signal that the model missed
or contradicted. Each rule is named so its effect can be measured on its own
(see ``meetops_ml.evaluate``).

Two kinds of rules:

* **Demotions** turn a Task / Decision / Risk back into Other when the
  utterance is meeting management ("let's get started", "next slide",
  "thank you"), an open question that asks nobody to do anything, or a
  fragment.
* **Promotions** turn an utterance the model left as Other into Task /
  Decision / Risk when an explicit signal from the guideline is present: a
  request or commitment with a follow-up verb (Task), agreement language
  (Decision), or a stated problem or concern (Risk).

Promotions respect the guideline priority Task > Decision > Risk > Other and
only override a non-Other model label in one case: an explicit request with a
deadline, which the guideline ranks above everything else.

The rules were written from the guideline's signal lists and the
cross-validation errors on the *training* set. The test sets were not used
to design them.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

PRIORITY = {"Task": 3, "Decision": 2, "Risk": 1, "Other": 0}


def _rx(pattern: str) -> re.Pattern:
    return re.compile(pattern, re.I)


# --------------------------------------------------------------------------
# Vocabulary
# --------------------------------------------------------------------------

# Verbs that describe follow-up work, not something done in the meeting itself.
# Every form counts ("finish", "finishes", "finished", "finishing"), so "we need the deck finished"
# is recognised as well as "I'll finish the deck".
_FOLLOW_UP_VERBS = [
    "finish", "complete", "send", "email", "e-mail", "prepare", "write", "draft", "update", "fix", "check",
    "review", "test", "build", "deploy", "implement", "book", "schedule", "organise", "organize", "arrange",
    "contact", "call", "ask", "chase", "ping", "investigate", "research", "share", "upload", "document",
    "report", "install", "configure", "migrate", "order", "bring", "confirm", "connect", "change", "create",
    "design", "model", "draw", "sketch", "handle", "deliver", "submit", "approve", "merge",
]
_FOLLOW_UP_PHRASES = [
    "set up", "setting up", "follow up", "following up", "look into", "looking into", "dig into", "find out",
    "found out", "put together", "clean up", "cleaned up", "take care of", "work on", "working on", "sort out",
    "sorted out", "get back", "reach out", "talk to", "speak to", "meet with", "take that", "do it", "sign off",
    "signed off",
]
_IRREGULAR = ["sent", "written", "wrote", "done", "built", "run", "running", "ran", "bought", "brought",
              "made", "drawn", "drew", "put"]


def _forms(verb: str) -> str:
    if verb.endswith("e"):
        return rf"{verb}[sd]?|{verb[:-1]}ing"
    return rf"{verb}(?:s|es|ed|ing)?"


FOLLOW_UP = _rx(r"\b(" + "|".join([*(_forms(v) for v in _FOLLOW_UP_VERBS), *_FOLLOW_UP_PHRASES, *_IRREGULAR]) + r")\b")

DEADLINE = _rx(
    r"\bby\s+(the\s+)?(end of\s+)?(this\s+|next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
    r"weekend|week|month|tomorrow|tonight|today|morning|afternoon|evening|\d)|"
    r"\bbefore\s+(the\s+)?(next|our|this|friday|monday|tuesday|wednesday|thursday|go-live|launch|release|"
    r"freeze|deadline|sending)|"
    r"\b(today|tomorrow|tonight|this week|next week|this afternoon|after this call|after the meeting|"
    r"end of (the )?(day|week|month|sprint))\b|\b(on|by) the \d{1,2}(st|nd|rd|th)?\b|"
    r"\bnext (meeting|standup|stand-up|sprint)\b"
)

IN_MEETING = _rx(
    r"\b(go back|go through|go over|repeat|say that|explain|show (you|us)|share my screen|stop sharing|"
    r"start (with|by)|hand over|pass (it|you)|write (that|this) down|move on|be quick|take notes|"
    r"next slide|this slide)\b"
)

REQUEST = _rx(r"\b(can|could|would|will) (you|someone|somebody|one of you)\b|\bplease\b")

COMMITMENT = _rx(r"\b(i'?ll|i will|i'?m going to|i am going to|i'?m gonna|i can have|i'?ll have|i'?ll get)\b")

ASSIGNMENT = _rx(
    r"\byou (two|guys|all|both|three)\s*(will|'ll|have to|need to|should|must|are going to|'re going to)\b|"
    r"\b(someone|somebody|one of us) (has|needs|should|will have) to\b|\blet'?s make sure\b|"
    r"\bmake sure (that )?(we|you) \w+|\bkeep \w+ in the loop\b|"
    r"\byou (two|guys|both) (will )?(be )?(\w+ )?work(ing)? (on|together)\b"
)

NEED_TO = _rx(r"\bwe (really )?(need|have|'ve got|got) to\b")

# "We need the slide deck finished by Friday": a required result with a deadline, no "to".
NEED_DONE = _rx(
    r"\b(we|i|you|they)\s+(really\s+|also\s+|still\s+)?(need|want|must have|should have|have to have|"
    r"have to get|need to have|need to get|'d like)\s+.{1,60}?\b(done|finished|completed|ready|sent|fixed|"
    r"updated|deployed|tested|written|approved|signed off|in place|delivered|merged|submitted)\b"
)

DECISION = _rx(
    r"\b(we('ll| will)|let'?s|we('re| are) going to|we'?re gonna|we should just|i think we('ll| will)?) "
    r"(just )?go (with|for)\b|\bwe (go|stick) with\b|"
    r"\bwe (have |'ve )?(decided|agreed|settled on|chose|chosen)\b|^\W*(agreed|decided|settled|approved)\b|"
    r"\bit'?s (settled|decided|agreed)\b|\b(final|the) (decision|answer) is\b|"
    r"\blet'?s (not|drop|skip|keep|use|put|freeze|stick)\b|\bno need for\b|\b(so )?(we )?forget (about )?(the|it)\b|"
    r"\bwe('ll| will) (use|keep|stick with|drop|skip|ship|do the)\b|"
    r"\b(moves|goes|is moved|is pushed) to (the )?(next|backlog|v?\d)\b|\bstays (on|at|as)\b|"
    r"\bfrom now on\b|\bno exceptions\b"
)

RISK = _rx(
    r"\bthe (main |big |biggest |only |real )?(problem|issue|risk|concern|danger|worry|catch) (is|with|here|being)\b|"
    r"\b(i'?m|i am) (a bit |really |quite |a little |very |slightly )?(worried|concerned|nervous)\b|"
    r"\b(worries|concerns) me\b|\bmy (main |only )?(concern|worry) is\b|"
    r"\b(won'?t|will not|can'?t|cannot|can not) be able to\b|\b(won'?t|will not) (be ready|make it|work|fit|last)\b|"
    r"\b(we('re| are)|it'?s|that'?s) (behind|over budget|running late)\b|"
    r"\b(too|very|far too|way too|really) (expensive|costly|complicated|complex|difficult|slow|fragile|risky|tight)\b|"
    r"\b(likely|going|gonna) to (break|fail|slip|crash)\b|\bblock(ed|er|ers)\b|"
    r"\bmight (not|never) (work|fit|last|be ready|make it|be enough)\b|"
    r"\b(if|unless)\b.{0,80}\b(we|it|this|that|they|nobody|the \w+)('ll| will)? "
    r"(won'?t|will not|can'?t|cannot|miss|fail|slip|be late|go unnoticed)\b|"
    r"\b(if|unless)\b.{0,60}\b(slips|fails|is late|are late|goes down|breaks)\b|"
    r"\b(don'?t|do not|doesn'?t) have (the |enough |any )?(information|time|budget|money|data|resources|people|testers)\b|"
    r"\b(not sure|unsure|dunno|don'?t know) how (we|you|it|they) (would|could|can|will|are going to)\b|"
    r"\bcan'?t afford\b|\b(a real|a big|a serious) (gap|problem|issue)\b|\bnobody (actually )?knows\b"
)

HEDGED = _rx(r"\b(if we|if you|maybe|perhaps|i guess|could we|should we|what if)\b")
NEGATED_CUE = _rx(r"\b(shouldn'?t|should not|not|isn'?t|wouldn'?t|won'?t|never|doesn'?t|don'?t) (be |get |look )?(too|very|that)\b")

MEETING_MANAGEMENT = _rx(
    r"^\W*(okay|ok|so|right|alright|well)?[\s,]*(let'?s|let us) (get (started|going)|start|begin|move on|continue|"
    r"wrap (it )?up|take a break|have a break|go round|go around|catch up|do the .{0,40} (first|now|next)|"
    r"go for the .{0,40} (first|now|right now))\b|"
    r"\b(next|previous|last|this) slide\b|\bagenda\b|\b(thank you|thanks)\b(\s+\w+){0,2}\W*$|^\W*(thank you|thanks)\b|"
    r"\bsame time next\b|\b(any|other) questions\b|\bcatch up next\b|"
    r"^\W*(okay|ok|so|right)?[\s,]*(that'?s|i think that'?s) (it|everything|all)\b|"
    r"^\W*(hi|hello|good morning|morning|good afternoon)\b|\bthanks for joining\b|"
    r"^\W*(two|three|four|a few|some|a couple of) things\b|\bthis is the (weekly|daily|retro|review|meeting)\b|"
    r"\b(lunch|coffee|tea)( break)?\b|\bbreak now\b"
)

QUESTION_START = _rx(r"^\W*(what|how|why|when|where|which|who|is|are|do|does|did|should|shall|have|has|was|were|"
                     r"any|isn'?t|aren'?t|don'?t)\b")

FILLERS = _rx(r"\b(um+|uh+|erm|er|mm+|hmm+|uh-huh)\b[,.]?\s*")
REPEATS = _rx(r"\b(\w+)(\s+\1\b)+")
STOP = {"um", "uh", "yeah", "okay", "ok", "so", "and", "but", "the", "a", "mm", "oh", "well"}


def normalise(text: str) -> str:
    """Light clean-up for pattern matching: drop fillers and stutters, keep case and punctuation."""
    t = FILLERS.sub("", text or "")
    t = REPEATS.sub(r"\1", t)
    return re.sub(r"\s+", " ", t).strip()


def _is_question(t: str) -> bool:
    return t.endswith("?") or (bool(QUESTION_START.match(t)) and len(t.split()) <= 12 and not t.endswith("."))


def _content_words(t: str) -> int:
    return len([w for w in re.findall(r"[A-Za-z']+", t) if w.lower() not in STOP])


@dataclass
class RuleResult:
    label: str
    rule: str | None   # name of the rule that changed the label, None if the model label was kept


def apply_rules(text: str, label: str) -> RuleResult:
    """Return the final label for one utterance given the model's label."""
    t = normalise(text)
    question = _is_question(t)
    has_follow_up = bool(FOLLOW_UP.search(t))
    has_deadline = bool(DEADLINE.search(t))
    in_meeting = bool(IN_MEETING.search(t))
    hedged = bool(HEDGED.search(t))
    asks_or_commits = bool((REQUEST.search(t) or COMMITMENT.search(t)) and (has_follow_up or has_deadline))

    # ---- Demotions -------------------------------------------------------
    if label != "Other":
        if _content_words(t) < 2:
            return RuleResult("Other", "fragment")
        if MEETING_MANAGEMENT.search(t) and not asks_or_commits:
            return RuleResult("Other", "meeting_management")
        if label in ("Task", "Decision") and question and not REQUEST.search(t):
            return RuleResult("Other", "open_question")

    # ---- Promotions (highest priority first) -----------------------------
    candidates: list[tuple[str, str]] = []
    if not in_meeting:
        if REQUEST.search(t) and (has_follow_up or has_deadline):
            candidates.append(("Task", "request"))
        elif not question and COMMITMENT.search(t) and has_follow_up and not hedged:
            candidates.append(("Task", "commitment"))
        elif not question and ASSIGNMENT.search(t) and not hedged:
            candidates.append(("Task", "assignment"))
        elif not question and NEED_TO.search(t) and has_follow_up and has_deadline:
            candidates.append(("Task", "need_to_with_deadline"))
        elif not question and not hedged and NEED_DONE.search(t) and has_deadline:
            candidates.append(("Task", "need_done"))
    if not question and not hedged and DECISION.search(t):
        candidates.append(("Decision", "agreement"))
    if RISK.search(t) and not NEGATED_CUE.search(t) and not re.search(r"as far as i'?m concerned", t, re.I):
        candidates.append(("Risk", "concern"))

    for new_label, rule in candidates:
        overrides = label == "Other" or (new_label == "Task" and rule == "request" and has_deadline)
        if overrides and PRIORITY[new_label] > PRIORITY[label]:
            if MEETING_MANAGEMENT.search(t) and not asks_or_commits:
                continue
            return RuleResult(new_label, rule)
        if new_label == label:
            break  # the model already agrees with the strongest signal
    return RuleResult(label, None)


def apply_rules_batch(texts, labels) -> list[RuleResult]:
    return [apply_rules(t, l) for t, l in zip(texts, labels)]
