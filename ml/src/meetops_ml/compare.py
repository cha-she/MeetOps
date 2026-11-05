"""
Compare a retrained model with the one in use, and only let it go live if it is not worse.

    python -m meetops_ml.compare --old ml/models/v6 --new ml/models/v7 \\
        --data ml/data/labeled/test_v1v2.csv ml/data/labeled/indomain_v1.csv

Both models are scored on the same test sets (macro-F1, model only and with the rule layer).
The new model passes when, on every test set, its "model + rules" macro-F1 is at most
``--tolerance`` (0.01) below the old one. The backend always uses the newest model folder, so a
model that fails gets a ``REJECTED`` file and is skipped (data.latest_model_dir); passing removes it.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from .data import LABELS, load_labeled
from .evaluate import _scores
from .predict import Classifier

REJECTED = "REJECTED"


def score(clf, path: Path) -> dict:
    df = load_labeled(path)
    preds = clf.predict(df["text"].tolist(), use_rules=True)
    return {"model only": _scores(df["label"], [p.model_label for p in preds]),
            "model + rules": _scores(df["label"], [p.label for p in preds])}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--old", type=Path, required=True)
    ap.add_argument("--new", type=Path, required=True)
    ap.add_argument("--data", type=Path, nargs="+", required=True)
    ap.add_argument("--tolerance", type=float, default=0.01)
    args = ap.parse_args(argv)

    old, new = Classifier.load(args.old), Classifier.load(args.new)
    print(f"old: {old.name}   new: {new.name}\n")
    print(f"{'test set':<18}{'variant':<15}{'old':>7}{'new':>7}{'change':>8}   " + "  ".join(f"{l[:4]:>9}" for l in LABELS[:3]))
    failures = []
    for path in args.data:
        a, b = score(old, path), score(new, path)
        for variant in ("model only", "model + rules"):
            o, n = a[variant]["macro_f1"], b[variant]["macro_f1"]
            per = "  ".join(f"{a[variant][f'{l}_f1']:.2f}>{b[variant][f'{l}_f1']:.2f}" for l in LABELS[:3])
            print(f"{path.stem:<18}{variant:<15}{o:>7.3f}{n:>7.3f}{n - o:>+8.3f}   {per}")
        if b["model + rules"]["macro_f1"] < a["model + rules"]["macro_f1"] - args.tolerance:
            failures.append(path.stem)

    marker = args.new / REJECTED
    if failures:
        marker.write_text(f"worse than {args.old.name} on: {', '.join(failures)}\n", encoding="utf-8")
        print(f"\nREJECTED: {args.new.name} is worse on {', '.join(failures)}; the backend keeps using {args.old.name}.")
        return 1
    marker.unlink(missing_ok=True)
    print(f"\nPASSED: {args.new.name} is not worse on any test set; the backend will use it (newest version).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
