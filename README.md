# MeetOps — Intelligent Enterprise Meeting Management System

**CO3554 Data Management Project · University of Sri Jayewardenepura**
N.K.C. Shehani · Index 22/ENG/107 · Registration EN108977

MeetOps converts meeting inputs (audio, video, or text transcripts) into structured
enterprise records — **Tasks, Decisions, and Risks** — each linked to an owner, a
deadline, and the exact transcript segment that produced it. The goal is to give
small and medium enterprises a task tracker, decision register, and risk log that
are generated automatically from the meetings they already hold.

![MeetOps dashboard](docs/screenshots/dashboard.png)

## Project status

| Phase (from proposal timeline)                    | Status         |
|---------------------------------------------------|----------------|
| Background research and requirements              | ✅ Done         |
| Frontend dashboard (React)                        | ✅ Done (v2 design, light/dark) |
| Dataset preparation (AMI corpus → utterances)     | ✅ Done         |
| Annotation guideline and labelled sample          | ✅ Done (v1)    |
| Classification experiments (Task/Decision/Risk)   | ✅ v1–v3 + rule layer, in-domain evaluation |
| Information extraction (owner, deadline)          | ✅ Rule-based v1, evaluated |
| Database schema and FastAPI backend               | ✅ Done (SQLite / PostgreSQL) |
| Accounts, departments, role-based access, audit log | ✅ Done        |
| Human review of extracted items, label feedback   | ✅ Done         |
| Summaries, recurring risks, evidence links        | ✅ v1 (extractive / TF-IDF similarity) |
| Audio/video pipeline (FFmpeg + Whisper)           | ⏳ Semester 2   |
| DistilBERT classifier, email reminders, PDF export | ⏳ Semester 2   |

## Repository layout

```
meetops/
├── frontend/   React + TypeScript + Tailwind dashboard (Vite)
├── backend/    FastAPI application and PostgreSQL schema
├── ml/         Data preparation, annotation, classification and extraction
├── docs/       Architecture, setup guides, screenshots, reports
└── scripts/    Utility scripts (e.g. AMI corpus parsing)
```

## Quick start

Requires Node.js 18+ and Python 3.11.

**1. Backend + ML** (Python virtual environment at the repository root)

```bash
python -m venv .venv
.venv\Scripts\activate                      # Windows; on macOS/Linux: source .venv/bin/activate
python -m pip install -e ml -r backend/requirements.txt
python -m meetops_ml.train --version v3 --train ml/data/labeled/train_v2.csv --features full
cd backend
python -m app.seed --empty                  # empty database (or --demo for a demo organisation)
python -m uvicorn app.main:app --reload --port 8000
```

**2. Frontend** (second terminal)

```bash
cd frontend
npm install
npm run dev                                 # http://localhost:5173
```

On an empty database the dashboard asks you to create the first
administrator, who then adds departments and colleagues on the Team page.
Each person signs in with their own account. `python -m app.seed --demo`
instead creates a demo organisation and runs the sample transcripts through
the real pipeline. The dashboard only shows data from the backend; if the API
is not running it says so instead of showing sample data.

Upload `backend/samples/sprint8_planning.txt` on the New meeting page to watch
the pipeline classify a transcript and extract tasks, decisions and risks.
PostgreSQL instead of SQLite: `docker compose up -d` in `backend/` and set
`DATABASE_URL` (see `backend/README.md`).

Details per part: `frontend/README.md`, `backend/README.md`, `ml/README.md`,
`docs/annotation-guidelines.md`.

## System architecture

```
Audio / Video / Transcript
        │
        ▼
 Ingestion ──► FFmpeg (video → audio) ──► Whisper ASR ──► Transcript
                                                              │
                                                              ▼
                                     Preprocessing: cleaning + utterance segmentation
                                                              │
                                                              ▼
                Classification: TF-IDF model ──► rule layer ──► Task / Decision / Risk / Other
                                                              │
                                                              ▼
              Extraction + organising: owner, deadline, titles, merged replies, severity
                                                              │
                                                              ▼
              Review: confident items confirmed, the rest suggested for a person
                                                              │
                                                              ▼
                                   PostgreSQL ──► FastAPI ──► React dashboard
```

## Technology stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, React Router, Recharts
- **Backend:** FastAPI (Python), SQLAlchemy, PostgreSQL (SQLite for development), pytest
- **Machine learning / NLP:** scikit-learn (TF-IDF, Logistic Regression, Linear SVM, Naive Bayes, Random Forest), rule-based extraction with dateparser; DistilBERT and spaCy planned
- **Speech and media (next phase):** Whisper / Faster-Whisper, FFmpeg
- **Dataset:** AMI Meeting Corpus, annotated with Label Studio
- **Tooling:** GitHub Actions (frontend, backend and ML checks), Docker Compose

## Documentation

| Document | Content |
|----------|---------|
| [docs/features.md](docs/features.md) | Every screen with screenshots and what it does |
| [docs/architecture.md](docs/architecture.md) | Components, data flow, pipeline stages, design decisions |
| [docs/database-schema.md](docs/database-schema.md) | ER diagram and table reference |
| [docs/annotation-guidelines.md](docs/annotation-guidelines.md) | Labelling rules for Task / Decision / Risk / Other |
| [docs/demo-script.md](docs/demo-script.md) | Presentation walkthrough and video plan |
| [ml/README.md](ml/README.md) | Data pipeline, labelled datasets, training protocol, results v1–v3, rule layer, in-domain evaluation, extraction results |
| [backend/README.md](backend/README.md) | Accounts and roles, API reference, schema, pipeline, PostgreSQL setup |
| [frontend/README.md](frontend/README.md) | Screens, project structure, API client |
