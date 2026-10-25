# MeetOps — Intelligent Enterprise Meeting Management System

**CO3554 Data Management Project · University of Sri Jayewardenepura**
N.K.C. Shehani · Index 22/ENG/107 · Registration EN108977

MeetOps converts meeting inputs (audio, video, or text transcripts) into structured
enterprise records — **Tasks, Decisions, and Risks** — each linked to an owner, a
deadline, and the exact transcript segment that produced it. The goal is to give
small and medium enterprises a task tracker, decision register, and risk log that
are generated automatically from the meetings they already hold.

## Project status

| Phase (from proposal timeline)                    | Status         |
|---------------------------------------------------|----------------|
| Background research and requirements              | ✅ Done         |
| Frontend dashboard (React) with demo data         | ✅ Done         |
| Dataset preparation (AMI corpus → utterances)     | 🔄 In progress |
| Annotation guideline and labelled sample          | 🔄 In progress |
| Classification experiments (Task/Decision/Risk)   | 🔄 In progress |
| Information extraction (owner, deadline)          | 🔄 In progress |
| Database schema and FastAPI backend               | 🔄 In progress |
| Audio/video pipeline (FFmpeg + Whisper)           | ⏳ Semester 2   |
| Workflow, RBAC and audit log                      | ⏳ Semester 2   |
| Summaries, recurring-issue clustering, evidence   | ⏳ Semester 2   |

## Repository layout

```
meetops/
├── frontend/   React + TypeScript + Tailwind dashboard (Vite)
├── backend/    FastAPI application and PostgreSQL schema
├── ml/         Data preparation, annotation, classification and extraction
├── docs/       Architecture, setup guides, screenshots, reports
└── scripts/    Utility scripts (e.g. AMI corpus parsing)
```

## Quick start (frontend)

Requires Node.js 18 or newer.

```bash
cd frontend
npm install
npm run dev        # opens http://localhost:5173
```

The dashboard currently runs on sample data so every screen can be demonstrated
before the backend and ML pipeline are connected. See `frontend/README.md` for
the list of screens.

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
                              Classification: Task / Decision / Risk / Other (TF-IDF + ML)
                                                              │
                                                              ▼
                              Information extraction: owner, deadline, decision statement
                                                              │
                                                              ▼
                                   PostgreSQL ──► FastAPI ──► React dashboard
```

## Technology stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, React Router, Recharts
- **Backend:** FastAPI (Python), SQLAlchemy, PostgreSQL
- **Machine learning / NLP:** scikit-learn, spaCy, Hugging Face Transformers
- **Speech and media:** Whisper / Faster-Whisper, FFmpeg
- **Dataset:** AMI Meeting Corpus, annotated with Label Studio

## Documentation

Detailed documentation lives in the `docs/` folder and will grow with the project:
architecture, database schema, setup and installation, annotation guidelines,
experiment results, and demo screenshots.
