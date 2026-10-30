"""
Evaluate a trained model with and without the rule layer.

    python -m meetops_ml.evaluate
    python -m meetops_ml.evaluate --model-dir ml/models/v3 \
        --data ml/data/labeled/test_v1.csv ml/data/labeled/indomain_v1.csv

For every dataset it prints macro-F1, accuracy and per-class F1 for
"model only" and "model + rules", then how often each rule fired and how often
it was right. Results are written to ``<model-dir>/reports/rules_eval.csv``.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
from sklearn.metrics import f1_score

from .data import LABELS, ROOT, load_labeled
from .predict import Classifier

DEFAULT_DATA = [ROOT / "ml/data/labeled/test_v1.csv", ROOT / "ml/data/labeled/indomain_v1.csv"]


def _scores(y, p) -> dict:
    per = f1_score(y, p, labels=LABELS, average=None, zero_division=0)
    return {"macro_f1": float(f1_score(y, p, labels=LABELS, average="macro", zero_division=0)),
            "accuracy": float((pd.Series(y).values == pd.Series(p).values).mean()),
            **{f"{l}_f1": float(v) for l, v in zip(LABELS, per)}}


def evaluate(clf: Classifier, path: Path) -> tuple[list[dict], pd.DataFrame]:
    df = load_labeled(path)
    preds = clf.predict(df["text"].tolist(), use_rules=True)
    df["model"] = [p.model_label for p in preds]
    df["final"] = [p.label for p in preds]
    df["rule"] = [p.rule for p in preds]
    rows = [{"dataset": path.stem, "variant": "model only", **_scores(df["label"], df["model"])},
            {"dataset": path.stem, "variant": "model + rules", **_scores(df["label"], df["final"])}]
    return rows, df


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model-dir", type=Path, help="Model folder (default: newest under ml/models/)")
    ap.add_argument("--data", type=Path, nargs="+", default=DEFAULT_DATA)
    args = ap.parse_args(argv)

    clf = Classifier.load(args.model_dir)
    print(f"Model: {clf.name}\n")
    all_rows, details = [], []
    for path in args.data:
        rows, df = evaluate(clf, path)
        all_rows += rows
        df["dataset"] = path.stem
        details.append(df)
        counts = df["label"].value_counts().to_dict()
        print(f"{path.name}  ({len(df)} utterances: " + ", ".join(f"{l} {counts.get(l, 0)}" for l in LABELS) + ")")
        for r in rows:
            print(f"  {r['variant']:<14} macro-F1 {r['macro_f1']:.3f}  accuracy {r['accuracy']:.3f}   "
                  + "  ".join(f"{l} {r[f'{l}_f1']:.2f}" for l in LABELS))
        fired = df[df["rule"].notna()]
        if len(fired):
            print("  rules that changed a label (right / fired):")
            for rule, g in fired.groupby("rule"):
                print(f"    {rule:<22} {int((g['final'] == g['label']).sum())} / {len(g)}")
        print()

    out_dir = (args.model_dir or clf.model_dir) / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(all_rows).to_csv(out_dir / "rules_eval.csv", index=False, float_format="%.4f")
    pd.concat(details)[["dataset", "segment_id", "text", "label", "model", "final", "rule"]].to_csv(
        out_dir / "rules_eval_predictions.csv", index=False)
    print(f"Saved -> {out_dir / 'rules_eval.csv'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
