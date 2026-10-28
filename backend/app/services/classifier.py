"""Lazy access to the trained utterance classifier from the ml package."""

from __future__ import annotations

from functools import lru_cache

from meetops_ml.predict import Classifier

from ..config import settings


@lru_cache(maxsize=1)
def get_classifier() -> Classifier:
    """Load once per process; the newest version under ml/models/ unless MODEL_DIR is set."""
    return Classifier.load(settings.model_dir)


def model_name() -> str | None:
    try:
        return get_classifier().name
    except FileNotFoundError:
        return None
