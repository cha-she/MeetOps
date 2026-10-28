"""
Load the trained classifier and label new utterances.

    python -m meetops_ml.predict "I'll send the updated quote by Thursday."
    python -m meetops_ml.predict --file transcript.txt

The backend uses ``Classifier`` directly:

    clf = Classifier.load()
    for p in clf.predict(["we go with the rubber buttons"]):
        print(p.label, p.confidence)
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import joblib
import numpy as np

from .data import MODEL_FILENAME, latest_model_dir
from .preprocessing import segment_transcript
from .train import confidence_of


@dataclass
class Prediction:
    text: str
    label: str
    confidence: float


class Classifier:
    def __init__(self, pipeline, metadata: dict | None = None):
        self.pipeline = pipeline
        self.metadata = metadata or {}

    @classmethod
    def load(cls, model_dir: Path | str | None = None) -> "Classifier":
        """Load from a version folder; by default the newest one under ml/models/."""
        model_dir = Path(model_dir) if model_dir else latest_model_dir()
        pipeline = joblib.load(model_dir / MODEL_FILENAME)
        meta_path = model_dir / "metadata.json"
        metadata = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
        return cls(pipeline, metadata)

    @property
    def name(self) -> str:
        model = self.metadata.get("model", type(self.pipeline.named_steps["clf"]).__name__)
        version = self.metadata.get("version")
        return f"{model} ({version})" if version else model

    def predict(self, texts: list[str]) -> list[Prediction]:
        if not texts:
            return []
        labels = self.pipeline.predict(texts)
        conf = confidence_of(self.pipeline, texts)
        return [Prediction(t, str(l), round(float(c), 3)) for t, l, c in zip(texts, labels, conf)]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("texts", nargs="*", help="Utterances to classify")
    ap.add_argument("--file", type=Path, help="Plain-text transcript to segment and classify")
    ap.add_argument("--model-dir", type=Path, help="Model folder (default: newest under ml/models/)")
    ap.add_argument("--json", action="store_true", help="Print JSON instead of a table")
    args = ap.parse_args(argv)

    clf = Classifier.load(args.model_dir)
    texts = list(args.texts)
    speakers = [""] * len(texts)
    if args.file:
        for u in segment_transcript(args.file.read_text(encoding="utf-8")):
            texts.append(u.text)
            speakers.append(u.speaker)
    if not texts:
        ap.error("give one or more utterances, or --file")

    preds = clf.predict(texts)
    if args.json:
        print(json.dumps([asdict(p) for p in preds], indent=2))
    else:
        print(f"Model: {clf.name}\n")
        for s, p in zip(speakers, preds):
            who = f"{s}: " if s else ""
            print(f"{p.label:<9} {p.confidence:.2f}  {who}{p.text}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
