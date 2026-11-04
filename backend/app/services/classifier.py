"""Lazy access to the trained utterance classifier (model + rule layer) from the ml package."""

from __future__ import annotations

from functools import lru_cache

from meetops_ml.predict import Classifier

from ..config import settings


@lru_cache(maxsize=1)
def get_classifier() -> Classifier:
    """Load once per process; the newest version under ml/models/ unless MODEL_DIR is set."""
    return Classifier.load(settings.model_dir)


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
