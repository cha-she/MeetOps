"""
Feature extraction for the utterance classifier.

Three feature groups can be combined (see ``build_features``):

* ``word``  TF-IDF over word unigrams and bigrams. The baseline.
* ``char``  TF-IDF over character 2-5-grams inside word boundaries. Catches
            morphology and spelling variation ("worr-ied / worr-ying",
            "expens-ive") and is robust to transcription errors.
* ``lex``   A small hand-built lexicon of meeting-risk cues. Each utterance
            gets counts of hedges, problem words, cost words, negations and
            conditionals, plus two combination flags. These are the signals an
            annotator uses when deciding Risk, and they generalise beyond the
            vocabulary of the training meetings.

The lexicon was motivated by the v2 error analysis: the word model learned the
remote-control vocabulary of AMI rather than the *form* of a risk statement.
"""

from __future__ import annotations

import re

import numpy as np
from scipy.sparse import csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion
from sklearn.preprocessing import FunctionTransformer

# Patterns are applied to *cleaned* text (lowercase, contractions expanded).
LEXICON = {
    "hedge": r"\b(might|may|could|maybe|perhaps|probably|possibly|not sure|unsure|doubt|"
             r"wonder|wondering|afraid|worried|worry|worries|concern|concerned)\b",
    "problem": r"\b(problem|problems|issue|issues|risk|risky|difficult|hard|tricky|impossible|"
               r"fragile|break|breaks|broken|fail|fails|failed|slow|late|delay|delayed|behind|"
               r"bug|bugs|complicated|confusing|clumsy|awkward|unclear|missing)\b",
    "cost": r"\b(expensive|costly|cost|costs|budget|price|afford|cheap|over)\b",
    "negation": r"\b(not|no|never|without|nothing|nobody)\b",
    "conditional": r"\b(if|unless|otherwise|then)\b",
    "too": r"\btoo\b",
}
_COMPILED = {name: re.compile(pat) for name, pat in LEXICON.items()}
LEXICON_FEATURE_NAMES = list(LEXICON) + ["hedge_and_negation", "any_risk_cue"]


def lexicon_counts(texts) -> csr_matrix:
    """Cue counts per utterance, as a sparse matrix (one row per text)."""
    rows = []
    for text in texts:
        counts = [len(rx.findall(text)) for rx in _COMPILED.values()]
        hedge, problem, cost, negation, _cond, too = counts
        counts.append(int(hedge > 0 and negation > 0))          # "might not", "not sure"
        counts.append(int(problem > 0 or cost > 0 or too > 0))  # any explicit cue
        rows.append(counts)
    return csr_matrix(np.asarray(rows, dtype=float))


def word_vectorizer() -> TfidfVectorizer:
    return TfidfVectorizer(
        ngram_range=(1, 2),            # single words and word pairs ("i will", "we should")
        min_df=2,                      # ignore features seen in only one utterance
        sublinear_tf=True,             # 1 + log(tf): a word said twice is not twice as important
        token_pattern=r"(?u)\b\w+\b",  # keep one-letter words such as "i"
        lowercase=False,               # clean_text already lower-cased
    )


def char_vectorizer() -> TfidfVectorizer:
    return TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), min_df=2,
                           sublinear_tf=True, lowercase=False)


FEATURE_SETS = {
    "word": ("word",),
    "full": ("word", "char", "lex"),
}


def build_features(feature_set: str = "word") -> FeatureUnion:
    """FeatureUnion for a named feature set ('word' or 'full')."""
    try:
        groups = FEATURE_SETS[feature_set]
    except KeyError:
        raise ValueError(f"unknown feature set {feature_set!r}; choose from {list(FEATURE_SETS)}") from None
    parts = []
    if "word" in groups:
        parts.append(("word", word_vectorizer()))
    if "char" in groups:
        parts.append(("char", char_vectorizer()))
    if "lex" in groups:
        parts.append(("lex", FunctionTransformer(lexicon_counts)))
    return FeatureUnion(parts)


def feature_names(union: FeatureUnion) -> np.ndarray:
    names = []
    for name, part in union.transformer_list:
        if name == "lex":
            names.extend(f"lex:{n}" for n in LEXICON_FEATURE_NAMES)
        else:
            names.extend(f"{name}:{n}" for n in part.get_feature_names_out())
    return np.asarray(names)
