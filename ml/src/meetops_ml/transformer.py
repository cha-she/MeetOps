"""
Fine-tuned DistilBERT classifier (Task / Decision / Risk / Other).

Why a transformer: the TF-IDF models only count words, so "you're gonna be working on the
design" (a Task) and "we were working on the design" (Other) look almost the same to them.
DistilBERT (Sanh et al., 2019; a smaller BERT pre-trained on English text) reads the whole
sentence in order, so tense, who is addressed and negation change its representation.
Fine-tuning keeps that pre-trained knowledge and trains a classification layer on top, with
the whole network adjusted slightly to the labelled meeting data.

Context: a reply such as "Yes, I'll do it" or "That's a problem" only means something after
the line before it. Every utterance is therefore given to the model as a pair

    [CLS] utterance [SEP] other speaker: previous utterance [SEP]

(the previous line of the same meeting; "same speaker" or "other speaker" says who said it).
``--no-context`` trains on the utterance alone, for the comparison.

Training protocol (the same splits and metrics as train.py):
1. 10 % of the training set is held out (stratified) to choose the best epoch by macro-F1;
   the test sets are not used for any choice.
2. Class imbalance: the loss weights each class by 1 / sqrt(frequency), so rare classes count
   more without overwhelming Other.
3. The best epoch is saved to ml/models/<version>/ (local only) with metadata.json, then scored
   on every test set, model only and with the rule layer, as in evaluate.py.

    python -m meetops_ml.transformer train --version v5 --train ml/data/labeled/train_v3.csv \\
        --test ml/data/labeled/test_v1.csv ml/data/labeled/test_v2.csv ml/data/labeled/test_v1v2.csv \\
               ml/data/labeled/indomain_v1.csv
    python -m meetops_ml.transformer evaluate --model-dir ml/models/v5 --data ml/data/labeled/test_v1v2.csv
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, f1_score
from sklearn.model_selection import train_test_split

from .data import LABELS, ROOT, TRANSFORMER_DIR, label_counts, load_labeled, model_dir
from .rules import apply_rules

BASE_MODEL = "distilbert-base-uncased"
UTTERANCES = ROOT / "ml" / "data" / "processed" / "ami_utterances.csv"
MAX_LENGTH = 96          # tokens for utterance + context; longer pairs are cut from the context side


# ---------------------------------------------------------------- context

def _previous_lines() -> dict[str, tuple[str, str]]:
    """segment_id -> (previous utterance, its speaker) within the same AMI meeting."""
    if not UTTERANCES.exists():
        return {}
    u = pd.read_csv(UTTERANCES, usecols=["segment_id", "meeting_id", "speaker", "start_time", "text"],
                    dtype={"text": "string"}, low_memory=False)
    u = u.sort_values(["meeting_id", "start_time"], kind="stable")
    prev_text = u.groupby("meeting_id")["text"].shift(1)
    prev_spk = u.groupby("meeting_id")["speaker"].shift(1)
    return {sid: (str(t), str(s)) for sid, t, s in zip(u.segment_id, prev_text, prev_spk) if pd.notna(t)}


def context_text(previous: str | None, previous_speaker: str | None, speaker: str | None) -> str:
    """How the previous line is given to the model: "same speaker: …" or "other speaker: …"."""
    if not previous:
        return ""
    who = "same speaker" if str(previous_speaker) == str(speaker) else "other speaker"
    return f"{who}: {previous}"


def add_context(df: pd.DataFrame, lookup: dict[str, tuple[str, str]]) -> pd.DataFrame:
    """Column ``context``: "same speaker: …" / "other speaker: …" for the previous line, or ""."""
    df = df.copy()
    ctx = []
    previous = {}   # fallback for files that are whole meetings in order (e.g. the in-domain set)
    for row in df.itertuples():
        found = lookup.get(row.segment_id)
        if found is None:
            found = previous.get(row.meeting_id)
        ctx.append(context_text(found[0], found[1], row.speaker) if found else "")
        previous[row.meeting_id] = (row.text, row.speaker)
    df["context"] = ctx
    return df


# ---------------------------------------------------------------- model

def _torch():
    import torch

    torch.set_num_threads(min(os.cpu_count() or 4, 8))
    return torch


def _encode(tokenizer, texts: list[str], contexts: list[str] | None):
    if contexts is None:
        return tokenizer(texts, truncation=True, max_length=MAX_LENGTH, padding=True, return_tensors="pt")
    return tokenizer(texts, contexts, truncation="only_second", max_length=MAX_LENGTH, padding=True,
                     return_tensors="pt")


def predict_proba(model, tokenizer, texts: list[str], contexts: list[str] | None, batch_size: int = 64) -> np.ndarray:
    torch = _torch()
    model.eval()
    out = []
    with torch.no_grad():
        for i in range(0, len(texts), batch_size):
            enc = _encode(tokenizer, texts[i:i + batch_size], None if contexts is None else contexts[i:i + batch_size])
            out.append(torch.softmax(model(**enc).logits, dim=-1).numpy())
    return np.concatenate(out) if out else np.zeros((0, len(LABELS)))


def _scores(y, p) -> dict:
    per = f1_score(y, p, labels=LABELS, average=None, zero_division=0)
    return {"macro_f1": float(f1_score(y, p, labels=LABELS, average="macro", zero_division=0)),
            "accuracy": float((np.asarray(y) == np.asarray(p)).mean()),
            **{f"{l}_f1": float(v) for l, v in zip(LABELS, per)}}


def _seed(seed: int) -> None:
    torch = _torch()
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def train(train_df: pd.DataFrame, use_context: bool, epochs: int, batch_size: int, lr: float, seed: int):
    """Fine-tune on 90 % of ``train_df``; return (model, tokenizer, history) for the best epoch."""
    torch = _torch()
    from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

    _seed(seed)
    fit, val = train_test_split(train_df, test_size=0.1, stratify=train_df["label"], random_state=seed)
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL, num_labels=len(LABELS), id2label=dict(enumerate(LABELS)), label2id={l: i for i, l in enumerate(LABELS)})

    y_fit = torch.tensor([LABELS.index(l) for l in fit["label"]])
    freq = np.bincount(y_fit.numpy(), minlength=len(LABELS)) / len(y_fit)
    weights = torch.tensor(1 / np.sqrt(np.maximum(freq, 1e-6)), dtype=torch.float)
    loss_fn = torch.nn.CrossEntropyLoss(weight=weights / weights.mean())

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    steps = epochs * math.ceil(len(fit) / batch_size)
    scheduler = get_linear_schedule_with_warmup(optimizer, int(0.1 * steps), steps)

    texts, contexts = fit["text"].tolist(), fit["context"].tolist() if use_context else None
    best, best_state, history = -1.0, None, []
    for epoch in range(1, epochs + 1):
        model.train()
        order = np.random.permutation(len(texts))
        t0, total = time.time(), 0.0
        for b in range(0, len(order), batch_size):
            idx = order[b:b + batch_size]
            enc = _encode(tokenizer, [texts[i] for i in idx], None if contexts is None else [contexts[i] for i in idx])
            loss = loss_fn(model(**enc).logits, y_fit[idx])
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            optimizer.zero_grad()
            total += loss.item() * len(idx)
        proba = predict_proba(model, tokenizer, val["text"].tolist(), val["context"].tolist() if use_context else None)
        val_f1 = _scores(val["label"], [LABELS[i] for i in proba.argmax(1)])["macro_f1"]
        history.append({"epoch": epoch, "train_loss": total / len(texts), "val_macro_f1": val_f1,
                        "seconds": round(time.time() - t0)})
        print(f"  epoch {epoch}/{epochs}  loss {total / len(texts):.3f}  validation macro-F1 {val_f1:.3f}  "
              f"({time.time() - t0:.0f}s)", flush=True)
        if val_f1 > best:
            best = val_f1
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
    model.load_state_dict(best_state)
    return model, tokenizer, history


# ---------------------------------------------------------------- evaluation

def evaluate(model, tokenizer, use_context: bool, paths: list[Path], lookup) -> list[dict]:
    rows = []
    for path in paths:
        df = add_context(load_labeled(path), lookup)
        proba = predict_proba(model, tokenizer, df["text"].tolist(), df["context"].tolist() if use_context else None)
        model_labels = [LABELS[i] for i in proba.argmax(1)]
        final = [apply_rules(t, l).label for t, l in zip(df["text"], model_labels)]
        counts = label_counts(df)
        print(f"\n{path.name}  ({len(df)} utterances: " + ", ".join(f"{l} {counts[l]}" for l in LABELS) + ")")
        for variant, pred in (("model only", model_labels), ("model + rules", final)):
            s = _scores(df["label"], pred)
            rows.append({"dataset": path.stem, "variant": variant, **s})
            print(f"  {variant:<14} macro-F1 {s['macro_f1']:.3f}  accuracy {s['accuracy']:.3f}   "
                  + "  ".join(f"{l} {s[f'{l}_f1']:.2f}" for l in LABELS))
        if path.stem.startswith("test_v1v2"):
            print(classification_report(df["label"], model_labels, labels=LABELS, digits=3, zero_division=0))
    return rows


class TransformerClassifier:
    """A saved fine-tuned model behind the same interface as ``predict.Classifier``."""

    def __init__(self, model, tokenizer, metadata: dict, model_dir: Path):
        self.model, self.tokenizer, self.metadata, self.model_dir = model, tokenizer, metadata, model_dir
        self.uses_context = bool(metadata.get("context"))
        # Fine-tuned transformers are over-confident on natural meetings (ml/README.md, 3.12):
        # at >= 0.95 only 64 % of AMI test predictions were right, so nothing skips review.
        self.auto_confirm = metadata.get("auto_confirm")

    @classmethod
    def load(cls, model_path: Path) -> "TransformerClassifier":
        model, tokenizer, meta = load(model_path)
        return cls(model, tokenizer, meta, model_path)

    @property
    def name(self) -> str:
        return f"{self.metadata.get('model', 'distilbert')} ({self.metadata.get('version', self.model_dir.name)})"

    def predict(self, texts: list[str], use_rules: bool = True, contexts: list[str] | None = None):
        from .predict import Prediction

        if not texts:
            return []
        ctx = (contexts or [""] * len(texts)) if self.uses_context else None
        proba = predict_proba(self.model, self.tokenizer, list(texts), ctx)
        out = []
        for text, row in zip(texts, proba):
            model_label = LABELS[int(row.argmax())]
            label, rule = model_label, None
            if use_rules:
                r = apply_rules(text, model_label)
                label, rule = r.label, r.rule
            out.append(Prediction(text, label, round(float(row[LABELS.index(label)]), 3), model_label, rule))
        return out


def load(model_path: Path):
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    meta = json.loads((model_path / "metadata.json").read_text(encoding="utf-8"))
    path = model_path / TRANSFORMER_DIR
    return AutoModelForSequenceClassification.from_pretrained(path), AutoTokenizer.from_pretrained(path), meta


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("train", help="fine-tune DistilBERT and evaluate it")
    t.add_argument("--version", required=True, help="output folder under ml/models/, e.g. v5")
    t.add_argument("--train", type=Path, required=True)
    t.add_argument("--test", type=Path, nargs="+", required=True)
    t.add_argument("--epochs", type=int, default=4)
    t.add_argument("--batch-size", type=int, default=16)
    t.add_argument("--lr", type=float, default=3e-5)
    t.add_argument("--seed", type=int, default=42)
    t.add_argument("--no-context", action="store_true", help="utterance only, without the previous line")
    t.add_argument("--limit", type=int, help="use only N training rows (a quick check that everything runs)")
    e = sub.add_parser("evaluate", help="score a saved model on labelled files")
    e.add_argument("--model-dir", type=Path, required=True)
    e.add_argument("--data", type=Path, nargs="+", required=True)
    args = ap.parse_args(argv)

    lookup = _previous_lines()
    if args.cmd == "evaluate":
        model, tokenizer, meta = load(args.model_dir)
        evaluate(model, tokenizer, meta["context"], args.data, lookup)
        return 0

    use_context = not args.no_context
    train_df = add_context(load_labeled(args.train), lookup)
    if args.limit:
        per_class = max(2, args.limit // len(LABELS))
        train_df = pd.concat(g.sample(min(len(g), per_class), random_state=args.seed)
                             for _, g in train_df.groupby("label"))
    print(f"Training set: {len(train_df)} rows  {label_counts(train_df)}")
    print(f"Model       : {BASE_MODEL} fine-tuned, context={'previous line' if use_context else 'none'}, "
          f"{args.epochs} epochs, batch {args.batch_size}, lr {args.lr}\n")

    t0 = time.time()
    model, tokenizer, history = train(train_df, use_context, args.epochs, args.batch_size, args.lr, args.seed)
    out = model_dir(args.version)
    model.save_pretrained(out / TRANSFORMER_DIR)
    tokenizer.save_pretrained(out / TRANSFORMER_DIR)
    print(f"\nTrained in {time.time() - t0:.0f}s; best epoch "
          f"{max(history, key=lambda h: h['val_macro_f1'])['epoch']} -> {out / TRANSFORMER_DIR}")

    rows = evaluate(model, tokenizer, use_context, args.test, lookup)
    (out / "reports").mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(out / "reports" / "test_results.csv", index=False, float_format="%.4f")
    meta = {"version": args.version, "model": f"distilbert{'+context' if use_context else ''}", "base": BASE_MODEL,
            "context": use_context, "labels": LABELS, "train_file": str(args.train), "train_rows": len(train_df),
            "epochs": args.epochs, "batch_size": args.batch_size, "lr": args.lr, "seed": args.seed,
            "max_length": MAX_LENGTH, "history": history}
    (out / "metadata.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"\nSaved -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
