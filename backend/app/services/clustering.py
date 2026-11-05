"""
Risk themes: every risk raised in any meeting, grouped by what it is about.

Recurring-risk detection (summary.recurring_pairs) compares one new risk with each old one.
Themes look at all risks together and answer "what keeps coming up?" (budget, a supplier,
testing capacity …), the "recurring-issue clustering" of the project proposal.

    risk sentences
      -> sentence vectors     all-MiniLM-L6-v2 (sentence-transformers), a model trained so that
                              sentences with the same meaning get close vectors; without the
                              package: TF-IDF reduced with LSA (TruncatedSVD)
      -> groups               agglomerative clustering, Ward linkage (balanced groups; average
                              linkage chained almost everything into one group on AMI risks)
      -> number of themes     silhouette score for k = 2 .. min(12, risks / 3), preferring fewer
                              themes unless more are clearly better (+0.02)
      -> theme names          class-based TF-IDF over the nouns (spaCy): the words most typical of a
                              group compared with the other groups (the labelling step of BERTopic)
      -> one-off risks        a group of one is not a theme: those go to "Other risks"

Measured on the 177 labelled AMI risks of train_v3 (ml/README.md, section 6): MiniLM + Ward gives six
themes (screen / buttons, budget / cost, remote control / battery, speech recognition, casing
materials, and a mixed group), largest group 28 %; the TF-IDF + LSA fallback puts 54 % of the
risks in one group.
"""

from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass, field

import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, CountVectorizer, TfidfVectorizer
from sklearn.metrics import silhouette_score

from meetops_ml.preprocessing import clean_text

log = logging.getLogger("meetops.clustering")

SENTENCE_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
MAX_THEMES = 12
MIN_RISKS = 4            # fewer risks than this: no themes, just the list
RISKS_PER_THEME = 3      # at most one theme per three risks
CLEARLY_BETTER = 0.02    # silhouette gain needed to prefer one more theme
# spoken-language words that say nothing about the topic of a risk
FILLERS = {"yeah", "um", "uh", "think", "know", "mean", "like", "just", "gonna", "really", "thing", "things", "kind",
           "sort", "okay", "probably", "maybe", "got", "want", "need", "lot", "bit", "don", "did", "does", "going",
           "actually", "quite", "say", "said", "worried", "concern", "problem", "issue", "risk", "might", "afraid",
           "sure", "way", "ll", "ve", "re", "isn", "won", "doesn", "didn", "wouldn", "couldn", "ok", "right", "good",
           "time", "people", "point", "day", "days", "week", "weeks", "part", "today", "end"}
STOP = list(ENGLISH_STOP_WORDS | FILLERS)

_lock = threading.Lock()
_encoder = None
_cache: dict[str, np.ndarray] = {}   # sentence -> vector (risk texts rarely change)


def _sentence_encoder():
    """The MiniLM model, loaded once; None when sentence-transformers is not installed."""
    global _encoder
    if _encoder is None:
        with _lock:
            if _encoder is None:
                try:
                    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
                    from sentence_transformers import SentenceTransformer

                    _encoder = SentenceTransformer(SENTENCE_MODEL, device="cpu")
                except Exception as exc:  # noqa: BLE001 - package or model download unavailable
                    log.warning("sentence-transformers unavailable (%s); risk themes use TF-IDF + LSA", exc)
                    _encoder = False
    return _encoder or None


def method() -> str:
    return "MiniLM sentence vectors" if _sentence_encoder() else "TF-IDF + LSA"


def vectors(texts: list[str]) -> np.ndarray:
    encoder = _sentence_encoder()
    if encoder:
        todo = [t for t in dict.fromkeys(texts) if t not in _cache]
        if todo:
            with _lock:
                for t, v in zip(todo, encoder.encode(todo, normalize_embeddings=True, batch_size=64)):
                    _cache[t] = v
        return np.stack([_cache[t] for t in texts])
    # fallback: TF-IDF, reduced to a few dimensions so that sentences without shared words can still meet
    from sklearn.decomposition import TruncatedSVD

    X = TfidfVectorizer(stop_words=STOP, ngram_range=(1, 2), sublinear_tf=True).fit_transform(
        [clean_text(t) or t for t in texts])
    dims = max(2, min(50, X.shape[0] - 1, X.shape[1] - 1))
    Z = TruncatedSVD(n_components=dims, random_state=0).fit_transform(X) if X.shape[1] > 2 else X.toarray()
    norms = np.linalg.norm(Z, axis=1, keepdims=True)
    return Z / np.where(norms == 0, 1, norms)


def _choose_k(X: np.ndarray) -> tuple[int, np.ndarray, float]:
    top = max(2, min(MAX_THEMES, len(X) // RISKS_PER_THEME, len(X) - 1))
    tried = []
    for k in range(2, top + 1):
        labels = AgglomerativeClustering(n_clusters=k, linkage="ward").fit_predict(X)
        tried.append((k, labels, float(silhouette_score(X, labels, metric="cosine"))))
    best = max(s for _, _, s in tried)
    return next(t for t in tried if t[2] >= best - CLEARLY_BETTER)   # the fewest themes close to the best


def _topic_words(text: str) -> str:
    """The nouns of a sentence (what it is about), or the cleaned sentence without spaCy."""
    from . import nlp

    model = nlp._nlp()
    if model is None:
        return clean_text(text)
    return " ".join(t.lower_ for t in model(text) if t.pos_ in ("NOUN", "PROPN") and len(t.text) > 2)


def _keywords(texts: list[str], labels: np.ndarray, k: int, top: int = 3) -> list[list[str]]:
    """Class-based TF-IDF: join each group's nouns into one document; words frequent in one
    group and rare in the others name it."""
    words = [_topic_words(t) for t in texts]
    docs = [" ".join(w for w, l in zip(words, labels) if l == c) for c in range(k)]
    try:
        # single words: the documents are nouns joined across sentences, so pairs would be made up
        cv = CountVectorizer(stop_words=STOP, ngram_range=(1, 1), token_pattern=r"(?u)\b[a-z][a-z]+\b")
        C = cv.fit_transform(docs).toarray().astype(float)
    except ValueError:   # only stop words
        return [[] for _ in range(k)]
    tf = C / np.maximum(C.sum(axis=1, keepdims=True), 1)
    idf = np.log(1 + C.sum() / np.maximum(C.sum(axis=0), 1))
    score = tf * idf
    terms = cv.get_feature_names_out()
    out = []
    for c in range(k):
        words: list[str] = []
        for j in np.argsort(-score[c]):
            if score[c, j] <= 0 or len(words) == top:
                break
            term = terms[j]
            if not any(term.rstrip("s") == w.rstrip("s") for w in words):   # "cost" and "costs" once
                words.append(term)
        out.append(words)
    return out


@dataclass
class Theme:
    keywords: list[str]
    members: list[int] = field(default_factory=list)   # indices into the input list


def group(texts: list[str]) -> tuple[list[Theme], float | None]:
    """Themes (largest first) and the silhouette score of the chosen grouping."""
    if len(texts) < MIN_RISKS:
        return [], None
    X = vectors(texts)
    k, labels, score = _choose_k(X)
    names = _keywords(texts, labels, k)
    themes = [Theme(names[c], [i for i, l in enumerate(labels) if l == c]) for c in range(k)]
    real = sorted((t for t in themes if len(t.members) > 1), key=lambda t: -len(t.members))
    singles = [i for t in themes if len(t.members) == 1 for i in t.members]
    if singles:
        real.append(Theme([], singles))   # "Other risks"
    return real, round(float(score), 3)


def warm_up() -> None:
    """Load the sentence model in the background so the first themes request is fast."""
    threading.Thread(target=_sentence_encoder, name="risk-themes-warm-up", daemon=True).start()
