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

## 3. Classification and extraction

Documented in the next sections as the experiments are added:
preprocessing, TF-IDF baselines (Logistic Regression, Linear SVM, Naive Bayes,
Random Forest), transformer fine-tuning, and rule/NER-based extraction of task
owner and deadline.
