"""
Meeting overview and recurring-risk detection (no language model involved).

Overview
--------
A short extractive overview: the sentences that best represent the meeting.
Each sentence becomes a TF-IDF vector; a sentence's score is its *centrality*,
the sum of its cosine similarities to all other sentences (the idea behind
TextRank / LexRank): a sentence that shares vocabulary with much of the meeting
is about the main topic. Scores get a small boost for sentences classified as
Decision, Task or Risk, greetings and thank-yous are skipped, and the chosen
sentences are shown in the order they were said.

The dashboard combines this overview with the extracted decisions, action
items and risks into a structured summary, which updates whenever people
confirm or reject items.

Recurring risks
---------------
A new risk is "recurring" when its TF-IDF cosine similarity to a risk from an
earlier meeting is at least 0.35.
"""

from __future__ import annotations

import re

import numpy as np
from meetops_ml.preprocessing import clean_text
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

CATEGORY_BOOST = {"Decision": 1.3, "Task": 1.2, "Risk": 1.2, "Other": 1.0}
RECURRING_THRESHOLD = 0.35
SMALL_TALK = re.compile(
    r"^\W*(hi|hello|good (morning|afternoon|evening)|morning|thanks|thank you|okay|ok|right|so|alright|bye|"
    r"see you|same time|let'?s (start|get started|get going|begin)|this is the)\b", re.I)


def extractive_summary(segments: list[tuple[str, str]], max_sentences: int = 2) -> str | None:
    """segments: (text, category) in meeting order. Returns the most central sentences."""
    candidates = [(i, t, c) for i, (t, c) in enumerate(segments)
                  if len(t.split()) >= 5 and not SMALL_TALK.match(t)]
    if not candidates:
        candidates = [(i, t, c) for i, (t, c) in enumerate(segments) if len(t.split()) >= 3]
    if not candidates:
        return None
    if len(candidates) <= max_sentences:
        return " ".join(t for _, t, _ in candidates)

    # topic words only: common English words ("i", "will", "the") say nothing about the subject
    X = TfidfVectorizer(sublinear_tf=True, stop_words="english").fit_transform(clean_text(t) for _, t, _ in candidates)
    sims = cosine_similarity(X)
    np.fill_diagonal(sims, 0.0)
    centrality = sims.sum(axis=1) * np.array([CATEGORY_BOOST.get(c, 1.0) for _, _, c in candidates])

    chosen: list[int] = []
    for k in np.argsort(centrality)[::-1]:
        # avoid two sentences that say nearly the same thing
        if all(sims[k, j] < 0.5 for j in chosen):
            chosen.append(int(k))
        if len(chosen) == max_sentences:
            break
    return " ".join(candidates[k][1] for k in sorted(chosen, key=lambda k: candidates[k][0]))


def recurring_pairs(new_texts: list[str], old_texts: list[str]) -> list[tuple[int, int]]:
    """Indices (new_i, old_j) whose cleaned texts are similar enough to count as the same risk."""
    if not new_texts or not old_texts:
        return []
    vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True)
    all_docs = [clean_text(t) for t in new_texts + old_texts]
    X = vec.fit_transform(all_docs)
    sims = cosine_similarity(X[: len(new_texts)], X[len(new_texts):])
    return [(i, j) for i, j in zip(*np.where(sims >= RECURRING_THRESHOLD))]
