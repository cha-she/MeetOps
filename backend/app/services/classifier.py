"""Lazy access to the trained utterance classifier (model + rule layer) from the ml package."""

from __future__ import annotations

import threading

from meetops_ml.predict import Classifier

from ..config import settings


_classifier = None
_lock = threading.Lock()


def get_classifier() -> Classifier:
    """Load once per process; the newest version under ml/models/ unless MODEL_DIR is set.

    Requests and pipeline runs ask for it from several threads; the lock makes the first one load
    it while the others wait, so a half-loaded model is never shared.
    """
    global _classifier
    if _classifier is None:
        with _lock:
            if _classifier is None:
                _classifier = Classifier.load(settings.model_dir)
    return _classifier


def auto_confirm_threshold() -> float | None:
    """Model-only confidence at which an item skips review; None = every item is reviewed.

    TF-IDF models use AUTO_CONFIRM_CONFIDENCE. A transformer brings its own value (none by
    default): its probabilities were measured to be over-confident on natural meetings.
    """
    own = getattr(get_classifier(), "auto_confirm", "default")
    return settings.auto_confirm_confidence if own == "default" else own


def model_name() -> str | None:
    try:
        name = get_classifier().name
    except FileNotFoundError:
        return None
    return f"{name} + rules" if settings.use_rules else name
