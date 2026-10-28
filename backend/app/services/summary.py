"""
Extractive meeting summary and recurring-risk detection.

Both reuse TF-IDF from scikit-learn: the summary picks the utterances with the
most distinctive content (boosted when they were classified as Task, Decision
or Risk), and recurrence compares a new risk with risks from earlier meetings
by cosine similarity.
"""

from __future__ import annotations

import numpy as np
from meetops_ml.preprocessing import clean_text
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

CATEGORY_BOOST = {"Decision": 1.6, "Task": 1.4, "Risk": 1.4, "Other": 1.0}
RECURRING_THRESHOLD = 0.35


def extractive_summary(segments: list[tuple[str, str]], max_sentences: int = 3) -> str | None:
    """segments: (text, category) in meeting order."""
    texts = [t for t, _ in segments if len(t.split()) >= 4]
    cats = [c for t, c in segments if len(t.split()) >= 4]
    if not texts:
        return None
    if len(texts) <= max_sentences:
        return " ".join(texts)
    vec = TfidfVectorizer(sublinear_tf=True, min_df=1)
    X = vec.fit_transform(clean_text(t) for t in texts)
    scores = np.asarray(X.sum(axis=1)).ravel() / np.maximum(1, np.asarray((X > 0).sum(axis=1)).ravel()) ** 0.5
    scores = scores * np.array([CATEGORY_BOOST.get(c, 1.0) for c in cats])
    top = sorted(np.argsort(scores)[::-1][:max_sentences])
    return " ".join(texts[i] for i in top)


def recurring_pairs(new_texts: list[str], old_texts: list[str]) -> list[tuple[int, int]]:
    """Indices (new_i, old_j) whose cleaned texts are similar enough to count as the same risk."""
    if not new_texts or not old_texts:
        return []
    vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True)
    all_docs = [clean_text(t) for t in new_texts + old_texts]
    X = vec.fit_transform(all_docs)
    sims = cosine_similarity(X[: len(new_texts)], X[len(new_texts):])
    return [(i, j) for i, j in zip(*np.where(sims >= RECURRING_THRESHOLD))]
