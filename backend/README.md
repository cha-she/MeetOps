# MeetOps — Backend (FastAPI)

REST API behind the React dashboard. It stores meetings, transcript segments,
and the tasks / decisions / risks extracted from them, and runs the
processing pipeline on uploaded transcripts using the classifier from `ml/`.

```
backend/
├── app/
│   ├── main.py            FastAPI app, CORS, /api/health
│   ├── config.py          settings (.env): DATABASE_URL, MODEL_DIR, ...
│   ├── database.py        SQLAlchemy engine / session
│   ├── models.py          ORM tables (see schema below)
│   ├── schemas.py         API models, camelCase JSON matching frontend/src/types.ts
│   ├── serializers.py     ORM rows -> API models
│   ├── seed.py            demo data: python -m app.seed --reset
│   ├── routers/           one file per resource: meetings, tasks, decisions, risks, users, insights, search, notifications
│   └── services/
│       ├── pipeline.py    upload -> transcribe -> preprocess -> classify -> extract -> save
│       ├── classifier.py  loads the trained model (newest ml/models/vN)
│       ├── extraction.py  owner, deadline, risk severity (rule-based v1)
│       ├── summary.py     extractive summary + recurring-risk similarity
│       ├── notifications.py overdue / due-soon / assigned / status-change
│       └── audit.py       audit_logs writer
├── tests/                 pytest (python -m pytest)
├── samples/               example transcript for the upload demo
├── docker-compose.yml     PostgreSQL 16
└── .env.example
```

## 1. Run it

From the repository root, inside the Python 3.11 virtual environment:

```bash
python -m pip install -e ml            # the ML package (once)
python -m pip install -r backend/requirements.txt
cd backend
python -m app.seed --reset             # creates backend/meetops.db (SQLite) and fills it
python -m uvicorn app.main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/api/health (reports the database and model in use)

Start the frontend (`npm run dev` in `frontend/`): it probes `/api/health`
and shows the **Live** badge when the backend answers.

Tests:

```bash
cd backend
python -m pytest
```

## 2. Database

SQLAlchemy sits between the code and the database, so the same code runs on
both of these:

| Mode | Where the data lives | Setup |
|------|----------------------|-------|
| SQLite (default) | one file, `backend/meetops.db` | none |
| PostgreSQL | Docker volume `meetops_pgdata`, reachable at `localhost:5432`, database `meetops` | `docker compose up -d` in `backend/`, then set `DATABASE_URL` in `backend/.env` (see `.env.example`) and run the seed again |

Tables are created automatically on start-up (`Base.metadata.create_all`).

### Schema

```
users ──< meeting_participants >── meetings ──< segments
                                      │            ▲
                                      ├──< tasks ──┤   segment_id = evidence link
                                      ├──< decisions
                                      └──< risks
tasks ──< notifications          audit_logs (entity, action, detail, actor, time)
```

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `users` | people who can own tasks | name, initials, role |
| `meetings` | one per upload | title, date, source (audio/video/transcript), status, pipeline_stage, error_message, summary |
| `meeting_participants` | many-to-many | meeting_id, user_id |
| `segments` | one classified utterance | position, speaker, start_sec, text, category, confidence |
| `tasks` | extracted action items | description, owner_id, deadline, status, segment_id |
| `decisions` | agreed outcomes | statement, owner_id, decided_at, segment_id |
| `risks` | concerns and blockers | description, severity, recurring, segment_id |
| `notifications` | overdue / due_soon / assigned / status_change | message, task_id, read |
| `audit_logs` | who changed what | entity, entity_id, action, detail, actor_id |

Every task, decision and risk keeps `segment_id`, which the dashboard uses
to jump to the exact line of the transcript (the evidence link).

## 3. Processing pipeline

`POST /api/meetings/upload` (multipart: `file`, `title`, `date`) stores the
file, creates the meeting with status `Queued`, and processes it in a
background task. The meeting's `pipelineStage` advances through
`upload → transcribe → preprocess → classify → extract → save` and the
frontend polls `GET /api/meetings/{id}` to draw the progress.

| Stage | What happens |
|-------|--------------|
| transcribe | text transcripts skip this; audio/video stop here with a clear message until Whisper is integrated (next phase) |
| preprocess | `segment_transcript` splits `Speaker: text` lines (optional `[hh:mm:ss]` prefix) into one utterance per sentence |
| classify | the newest `ml/models/vN` classifier labels every utterance Task / Decision / Risk / Other with a confidence |
| extract | Task → owner (named participant, or the speaker for "I'll …") and deadline (`by Friday`, `next week`, `end of month`, dates); Risk → severity from cue words; recurring risks found by TF-IDF cosine similarity with earlier meetings |
| save | extractive summary (top TF-IDF utterances, boosted for Task/Decision/Risk), duration from the last timestamp, status `Processed`, audit entry |

Any error marks the meeting `Failed` with `errorMessage` instead of crashing
the server. Try it with `samples/sprint8_planning.txt`.

## 4. Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | status, version, database, model |
| GET | `/api/meetings` | `q`, `limit` |
| POST | `/api/meetings/upload` | multipart `file`, `title`, `date` → 201 Meeting |
| GET | `/api/meetings/{id}` | |
| GET | `/api/meetings/{id}/segments` | |
| DELETE | `/api/meetings/{id}` | cascades to segments, tasks, decisions, risks |
| GET | `/api/tasks` | `status`, `meetingId`, `ownerId`, `q`, `overdue`, `sort=deadline|created`, `limit` |
| PATCH | `/api/tasks/{id}` | `{status, deadline, description, ownerId}`; writes audit + notification |
| GET | `/api/decisions` | `meetingId`, `q` |
| GET | `/api/risks` | `meetingId`, `severity`, `q` |
| GET | `/api/users` | |
| GET | `/api/insights/summary` | totals, charts data, recurring risks |
| GET | `/api/search?q=` | across meetings, tasks, decisions, risks and transcript text |
| GET | `/api/notifications` | refreshes overdue / due-soon first |
| POST | `/api/notifications/read-all` | 204 |

JSON keys are camelCase and match `frontend/src/types.ts`.
