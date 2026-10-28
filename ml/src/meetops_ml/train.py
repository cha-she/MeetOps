"""
Train and evaluate the utterance classifier.

    python -m meetops_ml.train                       # train_v1.csv -> ml/models/v1/
    python -m meetops_ml.train --version v2 --train ml/data/labeled/train_v2.csv
    python -m meetops_ml.train --version v3 --train ml/data/labeled/train_v2.csv --features full

Protocol
--------
1. 5-fold stratified cross-validation of every candidate on the TRAINING set.
   Each utterance is predicted once by a model that never saw it.
2. The model with the best cross-validated macro-F1 is selected. This choice
   is made before the test set is touched, so the test score stays honest.
3. Every candidate is refit on the full training set and scored on the TEST
   set (two complete meetings, natural class distribution) for the report.
4. The selected model is saved to ``ml/models/<version>/classifier.joblib``
   with ``metadata.json`` and reports under ``reports/``.

Macro-F1 is the headline metric: it averages the F1 of Task, Decision, Risk
and Other with equal weight, so a model that only ever predicts Other scores
badly even though 95 % of utterances are Other.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.metrics import (classification_report, confusion_matrix, f1_score,
                             precision_recall_fscore_support)
from sklearn.model_selection import StratifiedKFold, cross_val_predict

from .data import DEFAULT_TEST, DEFAULT_TRAIN, LABELS, MODEL_FILENAME, label_counts, load_labeled, model_dir
from .features import FEATURE_SETS, feature_names
from .models import RANDOM_STATE, build_models


# ---------------------------------------------------------------------------
# Metrics helpers
# ---------------------------------------------------------------------------

def scores(y_true, y_pred) -> dict:
    p, r, f, support = precision_recall_fscore_support(
        y_true, y_pred, labels=LABELS, zero_division=0)
    out = {
        "macro_f1": float(f1_score(y_true, y_pred, labels=LABELS, average="macro", zero_division=0)),
        "weighted_f1": float(f1_score(y_true, y_pred, labels=LABELS, average="weighted", zero_division=0)),
        "accuracy": float(np.mean(np.asarray(y_true) == np.asarray(y_pred))),
    }
    for i, label in enumerate(LABELS):
        out[f"{label}_precision"] = float(p[i])
        out[f"{label}_recall"] = float(r[i])
        out[f"{label}_f1"] = float(f[i])
        out[f"{label}_support"] = int(support[i])
    return out


def confidence_of(pipeline, texts) -> np.ndarray:
    """Probability of the predicted class (softmax over margins for SVMs)."""
    clf = pipeline.named_steps["clf"]
    if hasattr(clf, "predict_proba"):
        return pipeline.predict_proba(texts).max(axis=1)
    margins = pipeline.decision_function(texts)
    margins = np.atleast_2d(margins)
    e = np.exp(margins - margins.max(axis=1, keepdims=True))
    return (e / e.sum(axis=1, keepdims=True)).max(axis=1)


def top_features(pipeline, n: int = 15) -> dict[str, list[str]] | None:
    """Most positive TF-IDF features per class for linear models."""
    clf = pipeline.named_steps["clf"]
    if not hasattr(clf, "coef_"):
        return None
    names = feature_names(pipeline.named_steps["features"])
    coef = clf.coef_
    return {
        label: names[np.argsort(coef[i])[::-1][:n]].tolist()
        for i, label in enumerate(clf.classes_)
    }


# ---------------------------------------------------------------------------
# Plots
# ---------------------------------------------------------------------------

def plot_confusion(cm: np.ndarray, title: str, path: Path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    row_sums = cm.sum(axis=1, keepdims=True)
    norm = np.divide(cm, row_sums, out=np.zeros_like(cm, dtype=float), where=row_sums > 0)
    fig, ax = plt.subplots(figsize=(5.2, 4.6))
    im = ax.imshow(norm, cmap="Blues", vmin=0, vmax=1)
    ax.set_xticks(range(len(LABELS)), LABELS)
    ax.set_yticks(range(len(LABELS)), LABELS)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    ax.set_title(title)
    for i in range(len(LABELS)):
        for j in range(len(LABELS)):
            ax.text(j, i, f"{cm[i, j]}\n{norm[i, j]:.0%}", ha="center", va="center",
                    color="white" if norm[i, j] > 0.5 else "black", fontsize=9)
    fig.colorbar(im, ax=ax, fraction=0.046, label="row-normalised")
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def plot_model_comparison(cv: pd.DataFrame, test: pd.DataFrame, path: Path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    names = cv.index.tolist()
    x = np.arange(len(names))
    fig, ax = plt.subplots(figsize=(6.5, 3.8))
    ax.bar(x - 0.2, cv["macro_f1"], 0.4, label="5-fold CV (train)")
    ax.bar(x + 0.2, test.loc[names, "macro_f1"], 0.4, label="Test set")
    ax.set_xticks(x, names)
    ax.set_ylim(0, 1)
    ax.set_ylabel("Macro-F1")
    ax.set_title("Classifier comparison")
    ax.legend()
    for i, name in enumerate(names):
        ax.text(i - 0.2, cv.loc[name, "macro_f1"] + 0.01, f"{cv.loc[name, 'macro_f1']:.2f}", ha="center", fontsize=8)
        ax.text(i + 0.2, test.loc[name, "macro_f1"] + 0.01, f"{test.loc[name, 'macro_f1']:.2f}", ha="center", fontsize=8)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


# ---------------------------------------------------------------------------
# Main experiment
# ---------------------------------------------------------------------------

def run(train_path: Path, test_path: Path, out_dir: Path, folds: int,
        version: str = "v1", feature_set: str = "word") -> dict:
    reports = out_dir / "reports"
    reports.mkdir(parents=True, exist_ok=True)

    train = load_labeled(train_path)
    test = load_labeled(test_path)
    print(f"Training set: {len(train):>5} rows  {label_counts(train)}")
    print(f"Test set    : {len(test):>5} rows  {label_counts(test)}")
    print(f"Features    : {feature_set} ({' + '.join(FEATURE_SETS[feature_set])})")
    print()

    models = build_models(feature_set)
    skf = StratifiedKFold(n_splits=folds, shuffle=True, random_state=RANDOM_STATE)

    # 1. Cross-validation on the training set -------------------------------
    print(f"{folds}-fold cross-validation on the training set")
    cv_rows = {}
    for name, pipe in models.items():
        t0 = time.perf_counter()
        pred = cross_val_predict(pipe, train["text"], train["label"], cv=skf)
        row = scores(train["label"], pred)
        row["fit_seconds"] = round(time.perf_counter() - t0, 1)
        cv_rows[name] = row
        print(f"  {name:<14} macro-F1 {row['macro_f1']:.3f}   "
              f"Task {row['Task_f1']:.2f}  Decision {row['Decision_f1']:.2f}  "
              f"Risk {row['Risk_f1']:.2f}  Other {row['Other_f1']:.2f}   ({row['fit_seconds']}s)")
    cv_df = pd.DataFrame(cv_rows).T
    cv_df.to_csv(reports / "cv_results.csv", float_format="%.4f")

    # 2. Model selection (before looking at the test set) ------------------
    best_name = cv_df["macro_f1"].astype(float).idxmax()
    print(f"\nSelected by CV macro-F1: {best_name}\n")

    # 3. Final fit + test-set evaluation -----------------------------------
    print("Test-set results (model trained on the full training set)")
    test_rows = {}
    fitted = {}
    for name, pipe in models.items():
        pipe.fit(train["text"], train["label"])
        fitted[name] = pipe
        pred = pipe.predict(test["text"])
        test_rows[name] = scores(test["label"], pred)
        mark = "  <- selected" if name == best_name else ""
        r = test_rows[name]
        print(f"  {name:<14} macro-F1 {r['macro_f1']:.3f}   "
              f"Task {r['Task_f1']:.2f}  Decision {r['Decision_f1']:.2f}  "
              f"Risk {r['Risk_f1']:.2f}  Other {r['Other_f1']:.2f}{mark}")
    test_df = pd.DataFrame(test_rows).T
    test_df.to_csv(reports / "test_results.csv", float_format="%.4f")

    best = fitted[best_name]
    test_pred = best.predict(test["text"])
    test_conf = confidence_of(best, test["text"])

    # 4. Reports for the selected model ------------------------------------
    report_txt = classification_report(test["label"], test_pred, labels=LABELS, zero_division=0, digits=3)
    (reports / "classification_report_test.txt").write_text(
        f"Model: {best_name}\nTest set: {test_path.name} ({len(test)} rows)\n\n{report_txt}", encoding="utf-8")
    print("\n" + report_txt)

    cm = confusion_matrix(test["label"], test_pred, labels=LABELS)
    plot_confusion(cm, f"{best_name} on test set", reports / "confusion_matrix_test.png")
    cv_pred_best = cross_val_predict(build_models(feature_set)[best_name], train["text"], train["label"], cv=skf)
    plot_confusion(confusion_matrix(train["label"], cv_pred_best, labels=LABELS),
                   f"{best_name}, {folds}-fold CV on training set", reports / "confusion_matrix_cv.png")
    plot_model_comparison(cv_df, test_df, reports / "model_comparison.png")

    errors = test.loc[test["label"] != test_pred, ["segment_id", "meeting_id", "speaker", "text", "label"]].copy()
    errors["predicted"] = test_pred[test["label"] != test_pred]
    errors["confidence"] = np.round(test_conf[(test["label"] != test_pred).to_numpy()], 3)
    errors.to_csv(reports / "errors_test.csv", index=False)

    feats = top_features(best)
    if feats:
        lines = [f"# Most influential features ({best_name})", ""]
        for label in LABELS:
            if label in feats:
                lines.append(f"**{label}**: " + ", ".join(f"`{f}`" for f in feats[label]))
                lines.append("")
        (reports / "top_features.md").write_text("\n".join(lines), encoding="utf-8")

    # 5. Save the model and its metadata ------------------------------------
    model_path = out_dir / MODEL_FILENAME
    joblib.dump(best, model_path)
    metadata = {
        "version": version,
        "model": best_name,
        "features": feature_set,
        "model_file": MODEL_FILENAME,
        "trained_on": str(date.today()),
        "labels": LABELS,
        "train_file": train_path.name,
        "train_rows": int(len(train)),
        "train_distribution": label_counts(train),
        "test_file": test_path.name,
        "test_rows": int(len(test)),
        "test_distribution": label_counts(test),
        "cv_folds": folds,
        "cv_macro_f1": round(float(cv_df.loc[best_name, "macro_f1"]), 4),
        "test_macro_f1": round(float(test_df.loc[best_name, "macro_f1"]), 4),
        "test_accuracy": round(float(test_df.loc[best_name, "accuracy"]), 4),
        "test_per_class_f1": {label: round(float(test_df.loc[best_name, f"{label}_f1"]), 4) for label in LABELS},
        "sklearn_version": sklearn.__version__,
        "python_version": sys.version.split()[0],
    }
    (out_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print(f"Saved model    -> {model_path}")
    print(f"Saved reports  -> {reports}")
    return metadata


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--version", default="v1", help="Output folder name under ml/models/ (default v1)")
    ap.add_argument("--train", type=Path, default=DEFAULT_TRAIN)
    ap.add_argument("--test", type=Path, default=DEFAULT_TEST)
    ap.add_argument("--out", type=Path, help="Override the output folder (default ml/models/<version>)")
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--features", choices=list(FEATURE_SETS), default="word",
                    help="word = TF-IDF baseline; full = words + character n-grams + risk-cue lexicon")
    args = ap.parse_args(argv)
    run(args.train, args.test, args.out or model_dir(args.version), args.folds, args.version, args.features)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
