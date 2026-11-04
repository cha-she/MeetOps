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

from .data import MODEL_FILENAME, TRANSFORMER_DIR, latest_model_dir
from .preprocessing import segment_transcript
from .rules import apply_rules


@dataclass
class Prediction:
    text: str
    label: str              # final label (after the rule layer when enabled)
    confidence: float       # model probability of the final label
    model_label: str = ""   # what the model alone predicted
    rule: str | None = None  # rule that changed the label, if any


class Classifier:
    def __init__(self, pipeline, metadata: dict | None = None, model_dir: Path | None = None):
        self.pipeline = pipeline
        self.metadata = metadata or {}
        self.model_dir = model_dir
        self.auto_confirm = "default"   # TF-IDF: the backend's AUTO_CONFIRM_CONFIDENCE applies

    @classmethod
    def load(cls, model_dir: Path | str | None = None):
        """Load from a version folder; by default the newest one under ml/models/.

        A DistilBERT folder (transformer.py) gives a ``TransformerClassifier`` with the same
        ``predict``. Without PyTorch installed, the newest TF-IDF model is used instead.
        """
        explicit = model_dir is not None
        model_dir = Path(model_dir) if explicit else latest_model_dir()
        if (model_dir / TRANSFORMER_DIR).is_dir():
            try:
                from .transformer import TransformerClassifier

                return TransformerClassifier.load(model_dir)
            except ImportError:
                if explicit:
                    raise
                model_dir = latest_model_dir(transformers=False)
        pipeline = joblib.load(model_dir / MODEL_FILENAME)
        meta_path = model_dir / "metadata.json"
        metadata = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
        return cls(pipeline, metadata, model_dir)

    @property
    def name(self) -> str:
        model = self.metadata.get("model", type(self.pipeline.named_steps["clf"]).__name__)
        version = self.metadata.get("version")
        return f"{model} ({version})" if version else model

    def _probabilities(self, texts: list[str]) -> tuple[np.ndarray, list[str]]:
        clf = self.pipeline.named_steps["clf"]
        classes = [str(c) for c in clf.classes_]
        if hasattr(clf, "predict_proba"):
            return self.pipeline.predict_proba(texts), classes
        margins = np.atleast_2d(self.pipeline.decision_function(texts))
        e = np.exp(margins - margins.max(axis=1, keepdims=True))
        return e / e.sum(axis=1, keepdims=True), classes

    def predict(self, texts: list[str], use_rules: bool = True, contexts: list[str] | None = None) -> list[Prediction]:
        """Label utterances. With ``use_rules`` the rule layer (rules.py) refines the model's labels.

        ``contexts`` (the previous line of each utterance) is only used by transformer models."""
        if not texts:
            return []
        proba, classes = self._probabilities(texts)
        out = []
        for text, row in zip(texts, proba):
            model_label = classes[int(row.argmax())]
            label, rule = model_label, None
            if use_rules:
                r = apply_rules(text, model_label)
                label, rule = r.label, r.rule
            conf = float(row[classes.index(label)]) if label in classes else float(row.max())
            out.append(Prediction(text, label, round(conf, 3), model_label, rule))
        return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("texts", nargs="*", help="Utterances to classify")
    ap.add_argument("--file", type=Path, help="Plain-text transcript to segment and classify")
    ap.add_argument("--model-dir", type=Path, help="Model folder (default: newest under ml/models/)")
    ap.add_argument("--json", action="store_true", help="Print JSON instead of a table")
    ap.add_argument("--no-rules", action="store_true", help="Model only, without the rule layer")
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

    preds = clf.predict(texts, use_rules=not args.no_rules)
    if args.json:
        print(json.dumps([asdict(p) for p in preds], indent=2))
    else:
        print(f"Model: {clf.name}{'' if args.no_rules else ' + rules'}\n")
        for s, p in zip(speakers, preds):
            who = f"{s}: " if s else ""
            note = f"  [rule {p.rule}: model said {p.model_label}]" if p.rule else ""
            print(f"{p.label:<9} {p.confidence:.2f}  {who}{p.text}{note}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
