"""
Candidate classifiers for Task / Decision / Risk / Other.

Every candidate is a scikit-learn Pipeline with the same three stages:

    clean  ->  features  ->  classifier

Putting ``clean_text`` inside the pipeline means the saved model carries its
own preprocessing: the backend only has to call ``predict`` on raw text.
The feature stage is chosen by name (see ``features.py``): ``word`` is the
TF-IDF baseline, ``full`` adds character n-grams and the risk-cue lexicon.

Why these four
--------------
* Logistic Regression  - strong, well-calibrated linear baseline; gives
                         probabilities, which the dashboard shows as confidence.
* Linear SVM           - usually the best linear model on sparse TF-IDF text.
* Complement Naive Bayes - the classic fast text baseline; the Complement
                         variant copes better with imbalanced classes than
                         plain Multinomial NB.
* Random Forest        - a non-linear comparison point.

Class imbalance (about 80 % Other in training, 95 % in real meetings) is
handled with ``class_weight="balanced"`` where the algorithm supports it, and
with macro-F1 as the selection metric so every class counts equally.
"""

from __future__ import annotations

from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import ComplementNB
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer
from sklearn.svm import LinearSVC

from .features import build_features
from .preprocessing import clean_batch

RANDOM_STATE = 42


def make_pipeline(classifier, feature_set: str = "word") -> Pipeline:
    return Pipeline([
        ("clean", FunctionTransformer(clean_batch)),
        ("features", build_features(feature_set)),
        ("clf", classifier),
    ])


def build_models(feature_set: str = "word") -> dict[str, Pipeline]:
    """Name -> untrained pipeline, in the order they are reported."""
    return {
        "logreg": make_pipeline(LogisticRegression(
            C=4.0, class_weight="balanced", max_iter=5000, random_state=RANDOM_STATE), feature_set),
        "linear_svm": make_pipeline(LinearSVC(
            C=0.5, class_weight="balanced", random_state=RANDOM_STATE), feature_set),
        "naive_bayes": make_pipeline(ComplementNB(alpha=0.3), feature_set),
        "random_forest": make_pipeline(RandomForestClassifier(
            n_estimators=400, class_weight="balanced_subsample",
            random_state=RANDOM_STATE, n_jobs=-1), feature_set),
    }
