"""Loading the labelled datasets."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

LABELS = ["Task", "Decision", "Risk", "Other"]
REQUIRED_COLUMNS = {"segment_id", "meeting_id", "speaker", "text", "label"}

ROOT = Path(__file__).resolve().parents[3]  # repository root
DEFAULT_TRAIN = ROOT / "ml" / "data" / "labeled" / "train_v1.csv"
DEFAULT_TEST = ROOT / "ml" / "data" / "labeled" / "test_v1.csv"
MODELS_ROOT = ROOT / "ml" / "models"
MODEL_FILENAME = "classifier.joblib"


def model_dir(version: str) -> Path:
    """ml/models/<version>/ holds classifier.joblib, metadata.json and reports/."""
    return MODELS_ROOT / version


def latest_model_dir() -> Path:
    """Highest version folder that contains a trained classifier (v1 < v2 < v10)."""
    candidates = [p for p in MODELS_ROOT.glob("v*") if (p / MODEL_FILENAME).exists()]
    if not candidates:
        raise FileNotFoundError(f"no trained model under {MODELS_ROOT}; run `python -m meetops_ml.train`")
    return max(candidates, key=lambda p: int(p.name[1:]) if p.name[1:].isdigit() else -1)


def load_labeled(path: Path | str) -> pd.DataFrame:
    """Read a labelled CSV and validate it."""
    df = pd.read_csv(path, dtype={"text": "string"})
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"{path}: missing columns {sorted(missing)}")
    bad = set(df["label"].unique()) - set(LABELS)
    if bad:
        raise ValueError(f"{path}: unexpected labels {sorted(bad)}")
    df["text"] = df["text"].fillna("").astype(str)
    return df


def label_counts(df: pd.DataFrame) -> dict[str, int]:
    counts = df["label"].value_counts()
    return {label: int(counts.get(label, 0)) for label in LABELS}
