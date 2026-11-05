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

### 2.6 Labelled dataset v3 (4 Nov 2026): Task/Decision batch and a second test set

Two problems remained after v2: few Tasks (62) and Decisions (89) to learn
from, and a test set too small to show whether a change is real (6 Tasks,
6 Decisions, 8 Risks: one prediction moves a class F1 by about 0.15).

```bash
# Second test set: the two remaining kickoff meetings with no labelled line
python scripts/labelstudio_tasks.py --mode full --meetings TS3003a TS3006a --out ml/labelstudio/tasks_test2.json
# Training batch 3: Task / Decision candidates, never-labelled lines, test meetings excluded
python scripts/labelstudio_tasks.py --mode enriched --focus Task Decision --series ES IS TS --exclude ES2002a ES2003a TS3003a TS3006a --exclude-labeled ml/data/labeled/train_v2.csv ml/data/labeled/test_v1.csv --max-tasks 1000 --other-ratio 0.25 --seed 11 --out ml/labelstudio/tasks_train3.json
```

Both batches were labelled with the same guideline
([`docs/annotation-guidelines.md`](../docs/annotation-guidelines.md)); the
`notes` column gives the reason for each non-Other label.

| File | Rows | Task | Decision | Risk | Other | Pre-label agreement |
|------|------|------|----------|------|-------|---------------------|
| `test_v2.csv` (TS3003a, TS3006a, complete) | 482 | 20 | 10 | 3 | 449 | 93.6 % |
| `train_batch3.csv` | 1,000 | 108 | 198 | 15 | 679 | 48.8 % |
| `train_v3.csv` (= v2 + batch 3) | 2,600 | 170 | 287 | 177 | 1,966 | |
| `test_v1v2.csv` (= test v1 + v2) | 875 | 26 | 16 | 11 | 822 | |

No meeting of either test set has a line in the training data. AMI's own
annotations are not used as training labels directly: checked against the
manual labels, its "decisions" links were right for 31 % of utterances and
its "problems" links for 23 %, so they only serve to find candidates.

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
├── rules.py           rule layer applied after the classifier (section 3.7)
├── evaluate.py        model vs model + rules on the test sets (section 3.8)
├── transformer.py     fine-tuned DistilBERT: training, evaluation, TransformerClassifier (section 3.12)
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

### 3.7 Rule layer after the model (hybrid classification)

Testing the deployed system on a modern software-team transcript showed two
systematic problems: explicit requests such as "Kasun, can you connect the
dashboard to the live API this week?" were missed, and agenda sentences
("Two things on the agenda today …") were labelled Task. The cause is domain
shift: the model learned from AMI design meetings recorded in 2005, where people
rarely phrase commitments this explicitly.

`ml/src/meetops_ml/rules.py` adds a rule layer **after** the classifier. The
model is unchanged and still evaluated on its own; the rules only correct
labels where the annotation guideline gives an explicit signal:

| Rule | Direction | Signal (from the guideline) |
|------|-----------|-----------------------------|
| `request` | Other → Task | "can / could / would you", "please" + a follow-up verb or a deadline |
| `commitment` | Other → Task | "I'll / I will / I'm going to" + a follow-up verb (send, fix, prepare …) |
| `assignment` | Other → Task | "you two will …", "someone needs to …", "let's make sure …" |
| `need_done` | Other → Task | "we need / want X finished, done, ready, sent" + a deadline |
| `agreement` | Other → Decision | "we'll go with", "agreed", "let's not", "from now on", "moves to 2.4", "is approved / rejected", "Correction:" |
| `concern` | Other → Risk | "the problem is", "I'm worried", "won't be able to", "if … won't …" |
| `meeting_management` | → Other | agenda, greetings, "thank you", "next slide", "let's get started" |
| `open_question` | Task/Decision → Other | a question that asks nobody to do anything |
| `fragment` | → Other | fewer than two content words |

Hedged ("maybe", "if we decided") and negated ("shouldn't be too complicated")
sentences are excluded. Promotions follow the guideline priority Task >
Decision > Risk > Other. The rules were written from the guideline's signal
lists and the cross-validation errors on the **training** set; the test sets
were not used to design them. On the training set (out-of-fold predictions)
they raise macro-F1 from 0.479 to 0.535, and each rule is right more often than
wrong.

One change was made after the evaluation in 3.8: testing the application showed
that "We need the slide deck finished by the end of the week" was missed,
because the verb list only matched base forms ("finish", not "finished") and
no rule covered "need X done by …". Follow-up verbs now match every form and
the `need_done` rule was added. Re-running the evaluation gave identical
results on both test sets (the new rule does not fire there), so the figures
in 3.8 are unchanged; the training-set figure above includes the fix.

A second round came from testing an unseen transcript in a different layout
(`00:40, Amira: "…"`, curly quotes, external participants). Three general gaps
were fixed: the transcript reader now accepts every common layout (see
`preprocessing.segment_transcript`), typographic quotes are normalised so
"I’ll" matches "I'll", and the `agreement` rule also covers approvals,
rejections and amendments ("No customer migration is approved", "I am not
agreeing to …", "Correction: …"). Both test-set results were again unchanged.

### 3.8 In-domain evaluation: model vs model + rules

AMI is the only labelled corpus, but MeetOps targets modern business meetings.
`ml/data/labeled/indomain_v1.csv` is a second, small test set: three realistic
meetings (mobile release planning, client onboarding review, incident
retrospective; transcripts in `ml/data/indomain/`), 89 utterances labelled
with the same guideline, written and labelled after the rules were frozen.

```bash
python -m meetops_ml.evaluate --model-dir ml/models/v3
```

| Test set | Variant | Macro-F1 | Accuracy | Task F1 | Decision F1 | Risk F1 | Other F1 |
|----------|---------|----------|----------|---------|-------------|---------|----------|
| AMI (`test_v1`, 393 utt.) | model only | 0.475 | 0.880 | 0.45 | 0.38 | 0.13 | 0.94 |
| AMI (`test_v1`, 393 utt.) | model + rules | 0.469 | 0.878 | 0.43 | 0.38 | 0.13 | 0.93 |
| In-domain (`indomain_v1`, 89 utt.) | model only | 0.404 | 0.539 | 0.58 | 0.00 | 0.40 | 0.64 |
| In-domain (`indomain_v1`, 89 utt.) | model + rules | **0.783** | **0.809** | **0.90** | **0.78** | **0.62** | **0.84** |

Reading the results:

- On AMI the rules barely fire (5 changes in 393 utterances), so the score is
  unchanged: AMI speakers rarely use explicit phrasing.
- On business meetings the model alone scores Decision F1 0.00, which confirms
  domain shift. With the rules, macro-F1 rises from 0.40 to 0.78; all 24 rule
  changes on this set were correct.
- The 17 remaining errors are mostly implicit risks without a cue word ("We
  also never tested restoring from the backups") and soft offers ("I can put
  the slides together"). Rules cannot catch these without over-fitting, which is
  the argument for a semantic model (DistilBERT) in the next phase.
- Caveat: the in-domain set is small and was written by the same author as the
  rules, so it may share phrasing with them. It should be extended with real
  recorded meetings; the review queue in the application collects exactly that
  data (see 3.9).

**Auto-confirm threshold.** In the application, extracted items are confirmed
automatically only when the model alone is confident; everything else waits in
a review queue. Precision of model-only items above each threshold:

| Threshold | In-domain: items / precision | AMI test: items / precision |
|-----------|------------------------------|-----------------------------|
| 0.5 | 16 / 0.88 | 37 / 0.19 |
| 0.6 | 13 / 0.85 | 23 / 0.22 |
| 0.7 | 9 / 0.89 | 12 / 0.17 |
| 0.8 | 6 / 1.00 | 4 / 0.25 |

The model's probabilities are poorly calibrated on AMI, so a low threshold
would confirm many wrong items. MeetOps uses 0.8 (`AUTO_CONFIRM_CONFIDENCE`)
and treats every rule-made label as a suggestion for a person to confirm.

### 3.9 Human review and feedback

Every task, decision and risk is stored as `suggested` or `confirmed`. People
confirm or reject suggestions in the Review screen, and can add a task,
decision or risk from any transcript line (e.g. a missed request). Each
confirmation, rejection or added item is written to the `label_feedback` table
(text, predicted label, corrected label): a confirmation means the label was
right, a rejection means the line is Other, an added item gives the right type.
A wrong type is fixed by rejecting the item and adding the right one from its
line; the export keeps the latest decision on a sentence. (Changing a line's
type in place was removed: people did it without rejecting, so the rejection
signal was lost.) The Model feedback page in the app lists every row. Undoing a review removes its row again. This is the
training data for the next model version (3.13).

### 3.10 Trying the model

```bash
python -m meetops_ml.predict "I'll send the updated quote by Thursday." "So we go with the rubber buttons."
python -m meetops_ml.predict --file path/to/transcript.txt
python -m meetops_ml.predict --model-dir ml/models/v1 "..."    # a specific version (default: newest)
python -m meetops_ml.predict --no-rules "..."                  # model only, without the rule layer
```

With rules, each line shows which rule changed the model's label, e.g.
`Task 0.08  Kasun, can you connect … [rule request: model said Other]`.

### 3.11 More data, same model: v4 (TF-IDF on dataset v3)

```bash
python -m meetops_ml.train --version v4 --train ml/data/labeled/train_v3.csv --test ml/data/labeled/test_v1v2.csv --features full
python -m meetops_ml.evaluate --model-dir ml/models/v4 --data ml/data/labeled/test_v1.csv ml/data/labeled/test_v2.csv ml/data/labeled/test_v1v2.csv ml/data/labeled/indomain_v1.csv
```

Cross-validation selected LinearSVM (CV macro-F1 0.598). Cross-validation
scores of v3 and v4 are not comparable (different training sets); the fixed
test sets are. Model only:

| Test set | Model | Training rows | Macro-F1 | Task F1 | Decision F1 | Risk F1 |
|----------|-------|---------------|----------|---------|-------------|---------|
| AMI `test_v1v2` (875) | v3 LogReg | 1,600 | 0.451 | 0.45 | 0.26 | 0.16 |
| AMI `test_v1v2` (875) | v4 LogReg | 2,600 | 0.457 | 0.36 | 0.43 | 0.12 |
| AMI `test_v1v2` (875) | v4 LinearSVM (selected) | 2,600 | 0.482 | 0.39 | 0.52 | 0.07 |
| In-domain (89) | v3 LogReg | 1,600 | 0.404 | 0.58 | 0.00 | 0.40 |
| In-domain (89) | v4 LinearSVM | 2,600 | 0.357 | 0.45 | 0.00 | 0.33 |

More data doubled Decision F1, the class with explicit wording ("we decided",
"let's go with"), but did not help Tasks or Risks, and in-domain scores fell.
Precision is the weak point: on `test_v1v2` Task precision is 0.32, because the
training set is enriched (24 % Task/Decision/Risk) while real meetings are
about 6 %. Word counts cannot separate "you're gonna be working on the design"
(Task) from "we were working on the design" (Other): the limit of bag-of-words
features, and the reason for a contextual model.

### 3.12 Fine-tuned DistilBERT: v5 (with the previous line) and v6 (sentence only)

`transformer.py` fine-tunes `distilbert-base-uncased` (Sanh et al., 2019): the
pre-trained network plus a four-class output layer, all weights updated on
`train_v3.csv`. Settings: 4 epochs, batch 16, learning rate 3e-5 with linear
warm-up and decay, maximum 96 tokens, loss weighted by 1 / sqrt(class
frequency); the epoch is chosen on a stratified 10 % of the training set, never
on a test set. v5 gives the model the previous line as a second segment
("other speaker: Kasun, can you send it by Friday?"); v6 sees the sentence only.

```bash
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -e "ml[transformer]"
python -m meetops_ml.transformer train --version v5 --train ml/data/labeled/train_v3.csv --test ml/data/labeled/test_v1.csv ml/data/labeled/test_v2.csv ml/data/labeled/test_v1v2.csv ml/data/labeled/indomain_v1.csv
python -m meetops_ml.transformer train --version v6 --train ml/data/labeled/train_v3.csv --test ml/data/labeled/test_v1.csv ml/data/labeled/test_v2.csv ml/data/labeled/test_v1v2.csv ml/data/labeled/indomain_v1.csv --no-context
```

Training took 23 minutes (v6) on a 12-core laptop CPU. Model only:

| Model | AMI `test_v1v2` macro-F1 | Task F1 | Decision F1 | Risk F1 | In-domain macro-F1 | In-domain + rules |
|-------|--------------------------|---------|-------------|---------|--------------------|-------------------|
| TF-IDF v3 (LogReg, 1,600 rows) | 0.451 | 0.45 | 0.26 | 0.16 | 0.404 | 0.783 |
| TF-IDF v4 (LinearSVM, 2,600 rows) | 0.482 | 0.39 | 0.52 | 0.07 | 0.357 | 0.762 |
| DistilBERT + previous line (v5) | 0.536 | 0.53 | 0.50 | 0.18 | 0.597 | 0.740 |
| **DistilBERT, sentence (v6)** | **0.557** | 0.51 | 0.47 | **0.30** | **0.652** | **0.776** |

- DistilBERT is better on every test set: +0.08 macro-F1 on AMI over the best
  TF-IDF model, and +0.30 on the business meetings, where TF-IDF suffered from
  domain shift. It learns how commitments and concerns are phrased, not AMI's
  topic words.
- The model now carries most of the work: on the business meetings the rules
  add 0.12 (TF-IDF: 0.40), and on AMI they change nothing.
- The previous line gave no measurable gain (v5 0.02 below v6, within run-to-run
  noise): the line before is often filler ("Let's see.", "Okay."). v6 is
  deployed.
- Remaining error: precision in natural meetings. On `test_v1v2` v6 finds 73 %
  of Tasks and 81 % of Decisions, but its Task precision is 0.40 and Decision
  precision 0.33. Human review removes these false alarms.
- Caveats: one training run per model (one seed) and small test classes
  (11 Risks), so differences of a few points are not significant; the gap
  between TF-IDF and DistilBERT is consistent across all four test sets.

**Auto-confirm for DistilBERT.** Its probabilities are over-confident on natural
meetings. Precision of v6's model-only Task/Decision/Risk predictions:

| Threshold | In-domain: items / precision | AMI `test_v1v2`: items / precision |
|-----------|------------------------------|------------------------------------|
| 0.8 | 25 / 0.80 | 80 / 0.42 |
| 0.9 | 21 / 0.86 | 51 / 0.55 |
| 0.95 | 8 / 1.00 | 33 / 0.64 |

Requiring the TF-IDF model to agree raised AMI precision at 0.95 to 0.77
(22 items), still not safe. A transformer model therefore auto-confirms nothing
(`TransformerClassifier.auto_confirm` is None unless set in its
`metadata.json`): every extracted item goes to review. TF-IDF models keep
`AUTO_CONFIRM_CONFIDENCE`.

**In the backend.** `Classifier.load()` returns a `TransformerClassifier` for a
folder with `transformer/`, with the same `predict()`; the newest version under
`ml/models/` is used (v6). Without PyTorch installed, the newest TF-IDF model is
used instead, which is what CI runs. Classifying 700 utterances (about a
one-hour meeting) takes 12.5 s on the CPU (TF-IDF: 0.2 s); loading takes about
10 s once per process.

### 3.13 Retraining on review feedback: v7 and the deployment gate

The loop: review in the app → export → retrain → compare → deploy only if not
worse.

```bash
cd backend
python -m app.export_feedback --out ../ml/data/labeled/feedback_v1.csv
cd ..
python -m meetops_ml.transformer train --version v7 --train ml/data/labeled/train_v3.csv ml/data/labeled/feedback_v1.csv --test ml/data/labeled/test_v1.csv ml/data/labeled/test_v2.csv ml/data/labeled/test_v1v2.csv ml/data/labeled/indomain_v1.csv --no-context
python -m meetops_ml.compare --old ml/models/v6 --new ml/models/v7 --data ml/data/labeled/test_v1v2.csv ml/data/labeled/indomain_v1.csv
```

**Export** (`backend/app/export_feedback.py`). One label per sentence (the
latest decision wins); sentences already in `train_v3` are skipped; and every
sentence that also appears in a test set (`test_v1`, `test_v2`, `indomain_v1`)
is dropped, otherwise the retrained model would be scored on sentences it was
trained on. Of 57 feedback rows from reviewing the demo meetings, 28 were
dropped this way (the demo meetings reuse sentences of the business test set):
a real leakage risk the export catches. 29 sentences were exported, all
confirmations: Task 10, Decision 8, Risk 11.

**Training.** `--train` takes several files; when a sentence is in more than
one, the later file's label wins. Same settings as v6; 2,625 rows (train_v3
has four duplicate "Other" lines, counted once).

**Gate** (`meetops_ml.compare`). Both models are scored on the same test sets.
The new model passes when its "model + rules" macro-F1 is at most 0.01 below
the old one on every set; otherwise a `REJECTED` file is written into its
folder and `data.latest_model_dir()` skips it, so the backend keeps the old
model without any manual step.

| Test set | Variant | v6 | v7 | Change |
|----------|---------|----|----|--------|
| AMI `test_v1v2` (875) | model only | 0.557 | 0.547 | -0.010 |
| AMI `test_v1v2` (875) | model + rules | 0.553 | 0.549 | -0.005 |
| In-domain (89) | model only | 0.652 | 0.626 | -0.025 |
| In-domain (89) | model + rules | 0.776 | 0.754 | -0.022 |

**Result: v7 rejected, v6 stays.** 29 extra lines are 1 % more data, and the
differences are the size of run-to-run noise (one seed; on the in-domain set
0.02 is one or two sentences). The value of this step is the working, safe
loop: feedback is collected, cleaned of test sentences, used for training, and
a model that is not better cannot go live by accident. It becomes useful once
real users have reviewed many meetings.

## 4. Extraction and organisation (owner, deadline, merged items)

Implemented in the backend (`backend/app/services/extraction.py`, `nlp.py`,
`organise.py`) because it needs the meeting date and the people in the
organisation. Three engines are available (`EXTRACTION_ENGINE`):

- **rules** — regular expressions for commitments, requests and time
  expressions, resolved to dates with `dateparser` relative to the meeting date.
- **spacy** — spaCy `en_core_web_sm`. The owner is found from the
  **dependency parse**: the person addressed at the start ("Kasun, can you …"),
  or the grammatical subject of a verb that expresses future work ("Priya is
  going to …", "Nia needs to …", "I'll …" = the speaker). A plain past or
  present subject is ignored ("Apple has been taking a week"). Deadlines come
  from **NER** DATE and TIME entities ("by the 3rd of December", "early next
  month"), excluding durations and past dates.
- **hybrid** (default) — rules first, spaCy for whatever they do not find.

The parse is used, not only the PERSON label, because the small English model
labels many Sri Lankan names as ORG or GPE ("Nethmi" → ORG, "Ishara" → GPE).

Further organisation: a request and its acceptance become one task ("Someone
needs to update the release notes" → "Kasun, could you take that?" → "Yep, I'll
do it" = one task, owner Kasun); follow-ups that add a deadline are merged
("Can we have the list by 11 September?" → "Confirmed."); titles are rewritten
as actions; owners without an account keep their spoken name.

```bash
cd backend
python -m app.evaluate_extraction
```

| Engine | Owner acc. (in-domain, 22) | Deadline F1 (in-domain) | Deadline F1 (AMI, 68 tasks) | Unseen probe: owner | Unseen probe: deadline |
|--------|-----------------------------|-------------------------|-----------------------------|---------------------|------------------------|
| rules | 1.00 | 1.00 | 0.86 | 8 / 16 | 13 / 16 |
| spacy | 0.91 | 0.78 | 0.00 | 12 / 16 | 13 / 16 |
| **hybrid** | **1.00** | **1.00** | **0.86** | **13 / 16** | **15 / 16** |

- The rules are precise on the phrasing they were developed on (the in-domain
  figures are an optimistic upper bound for that reason).
- spaCy alone finds no AMI deadlines: they are meeting-relative ("before
  lunch", "next meeting", "next time"), which a model trained on news text does
  not tag as DATE.
- On 16 unseen sentences with new names and phrasings, spaCy generalises much
  better than the rules for owners (12 vs 8), and the hybrid is best on both
  owner and deadline. The hybrid is therefore the default.

Remaining misses on the probe (not tuned away, to keep the probe honest):
"Raj has to finish … by the 3rd of December" and "Sofia should send …" (owner
not found), "Let me check the logs after lunch" (deadline not found), "Kenji is
responsible for … due December 12" (owner not found).

## 5. Recurring risks

When a meeting is processed, each new risk is compared with every risk from
earlier meetings that was not rejected. Both texts are cleaned
(`clean_text`), turned into TF-IDF vectors over words and word pairs, and
compared by **cosine similarity**. At 0.35 or more, both risks are flagged
*recurring* and appear in the Insights page and the Risk log filter.

Limitation: the comparison is lexical. "The battery may die early" and "power
runs out too soon" share no words and are not linked. Risk themes (section 6)
use sentence embeddings, which capture this.

## 6. Risk themes (clustering)

Recurring-risk detection compares one new risk with each old one. Themes look
at all risks together and answer "what keeps coming up?", the
"recurring-issue clustering" of the proposal
(`backend/app/services/clustering.py`, `GET /api/insights/risk-themes`, the
Themes view of the Risks page and a panel in Insights).

1. **Sentence vectors**: `all-MiniLM-L6-v2` (sentence-transformers), a small
   model trained so that sentences with the same meaning get nearby vectors,
   normalised to length 1. Without the package: TF-IDF reduced with LSA
   (TruncatedSVD).
2. **Clustering**: agglomerative clustering with Ward linkage. Average linkage
   chained almost everything into one group.
3. **Number of themes**: silhouette score (cosine) for k = 2 to
   min(12, risks / 3); the smallest k within 0.02 of the best score is chosen,
   so fewer, broader themes win unless more are clearly better.
4. **Names**: class-based TF-IDF over the nouns of each group (spaCy): the
   words frequent in one group and rare in the others, the labelling step of
   BERTopic. Spoken fillers ("yeah", "thing", "week") are stop words.
5. **One-off risks**: a group of one is not a theme; those are listed under
   "Other risks".

Measured on the 177 labelled AMI risks of `train_v3`:

| Vectors | Themes | Silhouette | Largest group |
|---------|--------|------------|---------------|
| MiniLM + Ward (used) | 6 | 0.08 | 28 % |
| TF-IDF + LSA + Ward (fallback) | 10 | 0.14 | 54 % |

MiniLM themes: screen · information · buttons (50), budget · cost (41),
remote control · battery (35), a mixed group named adaptation · banana (28),
speech recognition · voice (12), titanium · rubber casing (11). Silhouette is
low for both because short spoken sentences overlap in meaning; it is used to
choose k, not as proof of quality. Judged by reading the groups, five of the
six MiniLM themes are coherent design topics, while the fallback puts half of
all risks into one group. Earlier tries with plain TF-IDF and with DistilBERT's
own vectors (trained to separate the four classes, not topics) put 85-95 % of
the risks into one group.

