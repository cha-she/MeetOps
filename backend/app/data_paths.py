"""Small helpers about where models and data live (used by tests and health)."""

from __future__ import annotations

from meetops_ml.data import latest_model_dir

from .config import settings


def model_available() -> bool:
    try:
        return (settings.model_dir or latest_model_dir()) is not None
    except FileNotFoundError:
        return False
