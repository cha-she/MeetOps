# MeetOps — Backend (FastAPI)

REST API behind the React dashboard. It stores the organisation (departments
and accounts), meetings, transcript segments and the tasks / decisions / risks
extracted from them; runs the processing pipeline on uploaded transcripts
using the classifier and rule layer from `ml/`; and enforces role-based access.

```
backend/
├── app/
│   ├── main.py                FastAPI app, CORS, /api/health
│   ├── config.py              settings (.env): DATABASE_URL, SECRET_KEY, MODEL_DIR, AUTO_CONFIRM_CONFIDENCE ...
│   ├── database.py            SQLAlchemy engine / session
│   ├── models.py              ORM tables (see schema below)
│   ├── schemas.py             API models, camelCase JSON matching frontend/src/types.ts
│   ├── security.py            password hashing, signed tokens, role checks
│   ├── serializers.py         ORM rows -> API models
│   ├── seed.py                python -m app.seed --empty | --demo
│   ├── evaluate_extraction.py owner / deadline extraction vs labelled spans
│   ├── routers/               auth, meetings, tasks, decisions, risks, users (+ departments), insights (+ review, activity), search, notifications
│   └── services/
│       ├── pipeline.py        upload -> transcribe -> preprocess -> classify -> extract -> save
│       ├── classifier.py      loads the trained model (newest ml/models/vN) with the rule layer
│       ├── organise.py        merges replies into one task, picks titles, sets review status
│       ├── extraction.py      owner, deadline, action titles, risk severity
│       ├── review.py          confirm / reject, relabel transcript lines, label feedback
│       ├── summary.py         extractive summary + recurring-risk similarity
│       ├── insights.py        dashboard and analytics aggregates
│       ├── notifications.py   per-user overdue / due-soon / assigned / status-change / review
│       └── audit.py           audit_logs writer (also the activity feed)
├── tests/                     pytest (python -m pytest)
├── samples/                   example transcript for the upload demo
├── docker-compose.yml         PostgreSQL 16
└── .env.example
```

## 1. Run it

From the repository root, inside the Python 3.11 virtual environment:

```bash
python -m pip install -e ml            # the ML package (once)
python -m pip install -r backend/requirements.txt
cd backend
python -m app.seed --empty             # or --demo, see below
python -m uvicorn app.main:app --reload --port 8000
```

The classifier must exist under `ml/models/` (train it once with
`python -m meetops_ml.train --version v3 --train ml/data/labeled/train_v2.csv --features full`).

| Seed mode | What you get |
|-----------|--------------|
| `--empty` | No data at all. The app opens a **Set up your workspace** screen where you create the first administrator; that admin then adds departments and colleagues on the Team page. |
| `--demo` | Four departments and six demo accounts, plus the sample transcripts (`backend/samples/`, `ml/data/indomain/`) processed by the **real pipeline**. Nothing in the registers is written by hand. Demo accounts sign in as `<firstname>@meetops.demo` with the `DEMO_PASSWORD` in `app/seed.py` (local demonstrations only). |

Both modes drop and recreate all tables, so run one of them again after a
schema change.

- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/api/health (database, model version, rule layer on/off)

Tests (they create their own temporary database):

```bash
cd backend
python -m pytest
```

## 2. Accounts and roles

Passwords are hashed with salted scrypt. Signing in returns a token signed
with HMAC-SHA256 (`SECRET_KEY`), valid for `TOKEN_HOURS`; the frontend sends
it as `Authorization: Bearer …`. Every endpoint except health and sign-in
requires it.

| Action | Admin | Manager | Member |
|--------|-------|---------|--------|
| View meetings and registers | ✓ | ✓ | ✓ |
| Upload a meeting | ✓ | ✓ | ✓ |
| Edit / review a task | any | own department's meetings and people | tasks they own |
| Edit / review a decision or risk, relabel transcript lines | any | own department's meetings | meetings they attended or uploaded |
| Delete a meeting | any | own department | meetings they uploaded |
| Manage people and departments | ✓ | – | – |

Speaker names in transcripts are matched to accounts by full name, first name
or initials, so the first name in an account should match how people are
named in the transcript.

## 3. Database

SQLAlchemy sits between the code and the database, so the same code runs on
both of these:

| Mode | Where the data lives | Setup |
|------|----------------------|-------|
| SQLite (default) | one file, `backend/meetops.db` | none |
| PostgreSQL | Docker volume `meetops_pgdata`, reachable at `localhost:5432`, database `meetops` | `docker compose up -d` in `backend/`, then set `DATABASE_URL` in `backend/.env` (see `.env.example`) and run the seed again |

Tables are created automatically on start-up. Full ER diagram:
[`docs/database-schema.md`](../docs/database-schema.md).

| Table | Purpose |
|-------|---------|
| `departments` | organisational units |
| `users` | accounts: email, password hash, role, job title, department, active flag |
| `meetings` | one per upload: date, source, status, pipeline stage, department, uploader, summary, model used |
| `meeting_participants` | speakers matched to accounts |
| `segments` | one classified utterance: final label, confidence, the model's own label, the rule that changed it, corrected-by-a-person flag |
| `tasks` | action items: owner, deadline (+ the phrase said), status, priority, review status, confidence, source (ai / manual) |
| `decisions` | agreed outcomes: decided by, date, review status |
| `risks` | concerns: severity, status (open / mitigated / closed), owner, raised by, recurring flag, review status |
| `notifications` | per user: overdue, due soon, assigned, status change, review needed |
| `audit_logs` | who did what, when (feeds the activity stream) |
| `label_feedback` | every human correction of a label: text, predicted, corrected (training data for the next model) |

Every task, decision and risk keeps `segment_id`, the evidence link to the
exact transcript line.

## 4. Processing pipeline

`POST /api/meetings/upload` (multipart: `file`, `title`, `date`, optional
`departmentId`) stores the file, creates the meeting with status `Queued`, and
processes it in a background task. `pipelineStage` advances through
`upload → transcribe → preprocess → classify → extract → save`; the frontend
polls `GET /api/meetings/{id}` to draw the progress.

| Stage | What happens |
|-------|--------------|
| transcribe | text transcripts skip this; audio/video stop here with a clear message until Whisper is integrated (next phase) |
| preprocess | `segment_transcript` splits `Speaker: text` lines (optional `[hh:mm:ss]` prefix) into one utterance per sentence |
| classify | the newest `ml/models/vN` classifier labels every utterance; the rule layer (`ml/src/meetops_ml/rules.py`) then corrects explicit requests, commitments, agreements, concerns, agenda lines and open questions. Both labels are stored |
| extract | `organise.py` merges request → acceptance exchanges into one task, rewrites titles, takes owner and deadline from the exchange; decisions and risks get readable statements and a severity; recurring risks are found by TF-IDF cosine similarity with earlier meetings |
| save | review status (auto-confirmed only when the model alone is ≥ 0.8 confident, otherwise *suggested*), extractive summary, notifications to owners and the uploader, audit entry |

Any error marks the meeting `Failed` with `errorMessage` instead of crashing
the server. Try it with `samples/sprint8_planning.txt`.

## 5. Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | status, version, database, model, rules |
| GET | `/api/auth/status` | `{needsSetup}` (true on an empty database) |
| POST | `/api/auth/setup` | first administrator + department; only on an empty database |
| POST | `/api/auth/login` | `{email, password}` → `{token, user}` |
| GET | `/api/auth/me` | the signed-in user |
| GET / POST / PATCH | `/api/users`, `/api/users/{id}` | list (all); create and change role, department, password, active (admin) |
| GET / POST / PATCH / DELETE | `/api/departments`, `/api/departments/{id}` | list (all); manage (admin) |
| GET | `/api/meetings` | `q`, `departmentId`, `participantId`, `status`, `from`, `to`, `limit` |
| POST | `/api/meetings/upload` | multipart `file`, `title`, `date`, `departmentId` → 201 Meeting |
| GET / DELETE | `/api/meetings/{id}` | delete cascades to segments and extracted items |
| GET | `/api/meetings/{id}/segments` | transcript with labels, confidence, model label and rule |
| POST | `/api/segments/{id}/category` | relabel a transcript line; creates or removes the register entry and records feedback |
| GET | `/api/tasks` | `status`, `meetingId`, `ownerId`, `mine`, `unassigned`, `departmentId`, `review`, `priority`, `q`, `overdue`, `dueFrom`, `dueTo`, `from`, `to`, `sort=deadline|created|priority`, `limit` |
| POST | `/api/tasks` | add a task by hand |
| PATCH | `/api/tasks/{id}` | `{status, deadline, description, ownerId, priority, reviewStatus}`; editing a suggestion confirms it |
| GET / PATCH | `/api/decisions`, `/api/decisions/{id}` | filters `meetingId`, `ownerId`, `departmentId`, `review`, `from`, `to`, `q` |
| GET / PATCH | `/api/risks`, `/api/risks/{id}` | filters `meetingId`, `severity`, `status`, `ownerId`, `departmentId`, `recurring`, `review`, `from`, `to`, `q` |
| GET | `/api/review` | everything still *suggested*, for the review inbox |
| GET | `/api/insights/summary` | team and personal totals, weekly trend, workload, departments, recurring risks, on-time and review-acceptance rates |
| GET | `/api/activity` | recent audit entries |
| GET | `/api/search?q=` | across meetings, tasks, decisions, risks and transcript text |
| GET | `/api/notifications` | the signed-in user's notifications |
| POST | `/api/notifications/read-all` | 204 |

JSON keys are camelCase and match `frontend/src/types.ts`. Timestamps are UTC.
