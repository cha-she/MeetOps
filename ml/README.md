# MeetOps — Machine Learning

This folder holds the data pipeline, annotation workflow, and models that turn
meeting transcripts into Task / Decision / Risk records.

```
ml/
├── data/
│   ├── raw/          AMI corpus download (ignored by Git, 22 MB zip + unzipped XML)
│   ├── processed/    Parsed utterances and pre-labels (CSV)
│   └── labeled/      Manually verified labels exported from Label Studio
├── labelstudio/      Labelling interface config and import batches
└── models/           Trained classifiers and evaluation reports
```

## 1. Dataset: the AMI Meeting Corpus

The [AMI Meeting Corpus](https://groups.inf.ed.ac.uk/ami/corpus/) contains about
100 hours of real four-person meetings with human transcripts, released under
CC BY 4.0. Its manual annotations (22 MB) include word-level transcripts with
timestamps, dialogue-act segmentation, and per-meeting summaries whose
ACTIONS / DECISIONS / PROBLEMS sentences are linked to the supporting
utterances. MeetOps uses those links as weak pre-labels and then verifies every
label manually.

### 1.1 Download and unzip

```bash
# from the repository root
mkdir -p ml/data/raw
curl -L -o ml/data/raw/ami_public_manual_1.6.2.zip \
  https://groups.inf.ed.ac.uk/ami/AMICorpusAnnotations/ami_public_manual_1.6.2.zip
mkdir -p ml/data/raw/ami_public_manual_1.6.2
unzip -q ml/data/raw/ami_public_manual_1.6.2.zip -d ml/data/raw/ami_public_manual_1.6.2
```

### 1.2 Parse XML into utterances

```bash
python scripts/parse_ami.py --corpus ml/data/raw/ami_public_manual_1.6.2
```

Produces `ml/data/processed/ami_utterances.csv`, one row per dialogue act with
meeting id, speaker (with AMI role: PM, ID, UI, ME), start/end time, text,
dialogue-act type, a noise flag for backchannels/fragments, and the summary
sections (actions / decisions / problems) the utterance supports, if any.
Also writes `ami_meetings.csv` with per-meeting totals.

### 1.3 Add pre-labels

```bash
python scripts/make_prelabels.py
```

Produces `ami_prelabels.csv` by adding `prelabel` (Task / Decision / Risk /
Other), its source (`summlink`, `rule`, or `default`), a rough confidence, and
`is_candidate` (worth labelling: content-bearing and at least four words).

## 2. Manual annotation with Label Studio

Labelling rules are in [`docs/annotation-guidelines.md`](../docs/annotation-guidelines.md).

### 2.1 Install and start

```bash
pip install label-studio
label-studio start
```

Open http://localhost:8080, create an account (local only), then **Create
Project** → name it `MeetOps utterances` → **Labeling Setup** → **Custom
template** → paste the contents of `ml/labelstudio/config.xml` → Save.

### 2.2 Build the import batches

Labelling follows a two-set design so that evaluation stays honest while
labelling time goes where it matters:

| Batch | Mode | Purpose | Command |
|-------|------|---------|---------|
| Test set | `full` | Two whole meetings, natural class distribution, used only for final evaluation | see below |
| Training set | `enriched` | All utterances pre-labelled Task/Decision/Risk plus an equal number of random Other, from the remaining scenario meetings | see below |

```bash
# Test set (about 390 utterances)
python scripts/labelstudio_tasks.py --mode full --meetings ES2002a ES2003a --out ml/labelstudio/tasks_test.json

# Training set, batch 1 (1,200 utterances)
python scripts/labelstudio_tasks.py --mode enriched --series ES IS --exclude ES2002a ES2003a --max-tasks 1200 --out ml/labelstudio/tasks_train1.json

# Training set, batch 2 (400 utterances, Risk-focused, skips anything already labelled)
python scripts/labelstudio_tasks.py --mode enriched --focus Risk --series ES IS TS --exclude ES2002a ES2003a --exclude-labeled ml/data/labeled/train_v1.csv ml/data/labeled/test_v1.csv --max-tasks 400 --other-ratio 0.25 --seed 7 --out ml/labelstudio/tasks_train2.json
```

Create **two Label Studio projects** (`MeetOps test set`, `MeetOps training
set`) with the same labelling config and import one file into each. Each task
opens with the pre-label already selected; press `1`–`4` to set the category
and `Ctrl+Enter` to submit. Later batches use a different `--seed` or add the
TS series.

### 2.3 Export labels

In Label Studio: **Export** → **JSON**. Then:

```bash
python scripts/labelstudio_export_to_csv.py --export path/to/test-export.json --out ml/data/labeled/test_v1.csv
python scripts/labelstudio_export_to_csv.py --export path/to/train-export.json --out ml/data/labeled/train_v1.csv
```

The script prints the label distribution and how often the pre-label was
already correct. Both CSV files are committed to Git; `train_v1.csv` trains the
classifier and `test_v1.csv` is touched only for the final evaluation.

### 2.4 Labelled dataset v1 (28 Oct 2026)

| File | Rows | Task | Decision | Risk | Other | Source meetings |
|------|------|------|----------|------|-------|-----------------|
| `ml/data/labeled/test_v1.csv` | 393 | 6 | 6 | 8 | 373 (94.9 %) | ES2002a, ES2003a (complete) |
| `ml/data/labeled/train_v1.csv` | 1,200 | 58 | 84 | 81 | 977 (81.4 %) | 96 ES and IS meetings (enriched sample) |

Pre-label agreement (how often the weak label was already correct): 91.9 % on
the test set, 64.5 % on the enriched training set. The lower training figure is
expected: that set was deliberately filled with uncertain candidates, where the
weak labels are least reliable. Every row was reviewed against
[`docs/annotation-guidelines.md`](../docs/annotation-guidelines.md); the `notes`
column records the reason for each non-Other label.

### 2.5 Labelled dataset v2 (29 Oct 2026): Risk-focused batch

The v1 classifier was weakest on Risk (see 3.4), so a second batch targeted
that class: 320 utterances pre-labelled Risk (AMI "problems" links and rules)
plus 80 random Other, from 118 meetings across the ES, IS and TS series, none
of them labelled before.

| File | Rows | Task | Decision | Risk | Other |
|------|------|------|----------|------|-------|
| batch 2 (new rows) | 400 | 4 | 5 | 81 | 310 |
| `ml/data/labeled/train_v2.csv` (= v1 + batch 2) | 1,600 | 62 | 89 | 162 | 1,287 |

Only 81 of the 320 Risk pre-labels survived review (25 %): the "problems"
summary links point at whole stretches of discussion, not just the utterance
that states the problem. The other 239 rows stay in the set as hard negatives,
utterances that look like Risks but are not. The test set is unchanged.

## 3. Classification

The ML code is an installable package in `ml/src/meetops_ml/` so the backend
can import it.

```
ml/src/meetops_ml/
├── preprocessing.py   clean_text (normalisation) and segment_transcript (uploads)
├── data.py            dataset loading and label constants
├── features.py        word TF-IDF, character TF-IDF and the risk-cue lexicon
├── models.py          the four candidate pipelines (clean -> features -> classifier)
├── train.py           cross-validation, model selection, test evaluation, reports
└── predict.py         Classifier.load() / predict() used by the backend and CLI
ml/tests/              pytest unit tests
ml/models/<version>/   classifier.joblib + metadata.json + reports/ (local only, ignored by Git)
```

### 3.1 Setup

```bash
# from the repository root, inside the Python 3.11 virtual environment
python -m pip install -e "ml[dev]"
python -m pytest ml/tests
```

### 3.2 Preprocessing

`clean_text` is applied to every utterance, both when training and inside the
saved model at prediction time, so the two can never drift apart:

| Step | Example |
|------|---------|
| Join AMI spelled letters | `T_V_` → `tv` |
| Lowercase | `Okay` → `okay` |
| Expand contractions and informal forms | `I'll` → `i will`, `gonna` → `going to`, `won't` → `will not` |
| Drop punctuation | `remote,` → `remote` |
| Remove fillers | `um`, `uh`, `you know`, `i mean` |
| Collapse stutters | `we we have` → `we have` |

Stop words are kept on purpose: "I will", "we should" and "can you" are the
very words that separate the classes. For uploaded transcripts,
`segment_transcript` splits `Speaker: text` lines (optionally time-stamped)
into one utterance per sentence, the unit the model was trained on.

### 3.3 Training protocol

```bash
python -m meetops_ml.train                                                   # v1: train_v1.csv -> ml/models/v1/
python -m meetops_ml.train --version v2 --train ml/data/labeled/train_v2.csv  # v2: train_v2.csv -> ml/models/v2/
python -m meetops_ml.train --version v3 --train ml/data/labeled/train_v2.csv --features full   # v3: richer features
```

1. Five-fold stratified cross-validation of each candidate on the **training
   set only** (every utterance is predicted once by a model that never saw it).
2. The candidate with the best cross-validated macro-F1 is selected **before**
   the test set is touched.
3. All candidates are refit on the full training set and scored on the test
   set for the comparison table.
4. The selected model is written to `ml/models/<version>/classifier.joblib`
   with `metadata.json`, and `reports/` receives `cv_results.csv`,
   `test_results.csv`, `classification_report_test.txt`, confusion matrices,
   `model_comparison.png`, `errors_test.csv` (every test mistake, for error
   analysis) and `top_features.md` (most influential words per class).

Feature sets (`--features`): `word` is TF-IDF over word unigrams and bigrams
(`min_df=2`, sublinear tf); `full` adds TF-IDF over character 2–5-grams and a
hand-built risk-cue lexicon (counts of hedges, problem words, cost words,
negations, conditionals and "too", plus a hedge-and-negation flag such as
"might not"). Class imbalance is handled with `class_weight="balanced"` and
macro-F1 as the selection metric, so a model that only predicts Other cannot
win even though it would be 95 % "accurate".

### 3.4 Results, dataset v1 (28 Oct 2026)

| Model | CV macro-F1 (train, 5-fold) | Test macro-F1 | Test accuracy |
|-------|------------------------------|---------------|---------------|
| **Logistic Regression** (selected) | **0.459** | 0.433 | 0.863 |
| Linear SVM | 0.429 | 0.468 | 0.916 |
| Complement Naive Bayes | 0.412 | 0.345 | 0.832 |
| Random Forest | 0.248 | 0.243 | 0.944 |

Per class on the test set (Logistic Regression): Task P 0.21 / R 0.67 / F1
0.32, Decision P 0.21 / R 0.67 / F1 0.32, Risk P 0.13 / R 0.25 / F1 0.17,
Other P 0.97 / R 0.88 / F1 0.92.

Reading the results:

- Random Forest's high accuracy is the imbalance trap: it predicts Other for
  almost everything, so macro-F1 collapses to 0.24. This is why macro-F1, not
  accuracy, is the headline metric.
- Balanced class weights trade precision for recall: the linear models find
  two thirds of the Tasks and Decisions but also raise false alarms on Other
  utterances that use similar words ("you'll all get instructions emailed to
  you" → Task). For MeetOps this is the right side to err on, because a user
  can dismiss a suggested task in one click but cannot recover one that was
  never surfaced.
- Risk is the weakest class. Risks are expressed indirectly ("might not be
  such a big hit in Greece") and the training set has only 81 of them.
- `top_features.md` shows the model also learned AMI scenario vocabulary
  (`plastic`, `rubber`, `questionnaire`), a sign of topic over-fitting with
  only 1,200 rows.

### 3.5 Results, dataset v2: did more Risk data help?

Same protocol, training on `train_v2.csv` (162 Risk rows instead of 81).

| Metric (Logistic Regression) | v1 | v2 |
|------------------------------|----|----|
| CV macro-F1 (train) | 0.459 | 0.450 |
| CV Risk F1 (train, 81 → 162 Risk rows) | 0.31 | **0.36** |
| Test macro-F1 | 0.433 | 0.425 |
| Test Risk F1 (8 Risk rows) | 0.17 | 0.06 |
| Test Task / Decision F1 | 0.32 / 0.32 | 0.36 / 0.36 |

Reading the results:

- Risk F1 under cross-validation, the reliable figure (162 examples), rose
  from 0.31 to 0.36, so the extra data did teach the model more about Risks.
- On the test set it got worse, and `errors_test.csv` shows why. The model
  learned surface cues (`too`, `not`, `problem`, `don't know`) and now flags
  small talk such as "I don't know what mine is" as Risk (25 false alarms),
  while the real test Risks are indirect reasoning about price and markets
  ("might not be such a big hit in Greece", "we're gonna have to be selling an
  awful lot of them") that contain none of those cues. A bag-of-words model
  cannot follow that reasoning, and 8 test Risks make the test figure swing
  by 0.1 per utterance.
- Conclusion: more data of the same kind is not enough for Risk. The model
  needs features that describe the *form* of a risk statement rather than its
  vocabulary, which motivates v3.

### 3.6 Results, v3: richer features

Same data as v2 (`train_v2.csv`), `--features full`: word TF-IDF plus
character n-grams plus the risk-cue lexicon.

| Metric (Logistic Regression) | v1 (words, train_v1) | v2 (words, train_v2) | v3 (full, train_v2) |
|------------------------------|------|------|------|
| CV macro-F1 (train) | 0.459 | 0.450 | **0.479** |
| CV Risk F1 (train) | 0.31 | 0.36 | **0.43** |
| Test macro-F1 | 0.433 | 0.425 | **0.475** |
| Test accuracy | 0.863 | 0.847 | **0.880** |
| Test Task / Decision / Risk / Other F1 | 0.32 / 0.32 / 0.17 / 0.92 | 0.36 / 0.36 / 0.06 / 0.92 | 0.45 / 0.38 / 0.13 / 0.94 |

- v3 improves every reliable figure: CV macro-F1 by 3 points over v2, CV
  Risk F1 from 0.36 to 0.43, test macro-F1 from 0.43 to 0.48, with fewer
  false alarms on Other (precision 0.97, recall 0.90).
- `top_features.md` now ranks the lexicon's `problem` cue as the strongest
  Risk feature and `conditional` in the top fifteen, ahead of scenario words.
  The model is learning what a risk statement looks like, not what AMI
  meetings talk about.
- Implicit risks remain hard: "The battery might not last a week" is now
  Risk at 0.54, a coin flip, and the indirect market-reasoning Risks in the
  test set are still mostly missed. **v3 is the deployed model.**

Planned improvements, in order of expected gain: neighbouring-utterance and
speaker-role context features, a fine-tuned DistilBERT comparison (semantic
rather than lexical), hyper-parameter tuning inside the cross-validation, and
more Task examples (still only 62).

### 3.7 Trying the model

```bash
python -m meetops_ml.predict "I'll send the updated quote by Thursday." "So we go with the rubber buttons."
python -m meetops_ml.predict --file path/to/transcript.txt
python -m meetops_ml.predict --model-dir ml/models/v1 "..."    # a specific version (default: newest)
```

## 4. Extraction (owner and deadline)

Rule-based extraction of task owner and deadline is the next component; the
`owner_span` and `deadline_span` columns of the labelled data are its
evaluation set.
