# MeetOps — Database Schema

Implemented in `backend/app/models.py` with SQLAlchemy 2. The same schema runs
on PostgreSQL 16 (target, via `backend/docker-compose.yml`) and on SQLite
(development default, file `backend/meetops.db`). Tables are created on
start-up; the seed script fills them with a sample project history.

## Entity-relationship diagram

```mermaid
erDiagram
    USERS ||--o{ MEETING_PARTICIPANTS : attends
    MEETINGS ||--o{ MEETING_PARTICIPANTS : has
    MEETINGS ||--o{ SEGMENTS : "is split into"
    MEETINGS ||--o{ TASKS : produces
    MEETINGS ||--o{ DECISIONS : produces
    MEETINGS ||--o{ RISKS : produces
    SEGMENTS |o--o{ TASKS : "evidence for"
    SEGMENTS |o--o{ DECISIONS : "evidence for"
    SEGMENTS |o--o{ RISKS : "evidence for"
    USERS |o--o{ TASKS : owns
    USERS |o--o{ DECISIONS : "decided by"
    TASKS ||--o{ NOTIFICATIONS : triggers
    USERS |o--o{ AUDIT_LOGS : actor

    USERS {
        int id PK
        string name
        string initials
        string role
        string email UK
        datetime created_at
    }
    MEETINGS {
        int id PK
        string title
        date date
        int duration_min
        string source "audio | video | transcript"
        string status "Queued | Processing | Processed | Failed"
        string pipeline_stage
        text error_message
        text summary
        string file_name
        datetime created_at
    }
    MEETING_PARTICIPANTS {
        int meeting_id PK, FK
        int user_id PK, FK
    }
    SEGMENTS {
        int id PK
        int meeting_id FK
        int position "order within the meeting"
        string speaker
        float start_sec
        text text
        string category "Task | Decision | Risk | Other"
        float confidence
    }
    TASKS {
        int id PK
        int meeting_id FK
        int segment_id FK
        text description
        int owner_id FK
        date deadline
        string status "Open | In Progress | Completed"
        datetime created_at
        datetime updated_at
    }
    DECISIONS {
        int id PK
        int meeting_id FK
        int segment_id FK
        text statement
        int owner_id FK
        date decided_at
    }
    RISKS {
        int id PK
        int meeting_id FK
        int segment_id FK
        text description
        string severity "Low | Medium | High"
        date raised_at
        bool recurring
    }
    NOTIFICATIONS {
        int id PK
        string type "overdue | due_soon | assigned | status_change"
        text message
        int task_id FK
        bool read
        datetime created_at
    }
    AUDIT_LOGS {
        int id PK
        string entity
        int entity_id
        string action
        text detail
        int actor_id FK
        datetime created_at
    }
```

## Design notes

- **Evidence link.** `tasks`, `decisions` and `risks` each carry `segment_id`
  (nullable, `ON DELETE SET NULL`). The dashboard uses it to open the meeting
  at that utterance. This is the traceability requirement of the project.
- **Cascade rules.** Deleting a meeting deletes its segments, tasks, decisions
  and risks (`ON DELETE CASCADE`). Deleting a user does not delete their tasks;
  the task becomes unassigned (`SET NULL`).
- **Indexes.** Foreign keys that are filtered by the API (`meeting_id`,
  `owner_id`) are indexed; `(meeting_id, position)` is unique so segments keep
  their order.
- **Status columns as strings.** `status`, `category`, `severity` and
  `source` are short strings validated by the API layer (Pydantic literals)
  rather than database enums, which keeps SQLite and PostgreSQL behaviour
  identical and makes adding a value a code change only.
- **Timestamps** are stored timezone-aware (UTC). Dates such as `deadline`
  and `decided_at` are plain dates because that is the granularity people use
  in meetings.
- **Audit log.** One row per create / update / delete / pipeline completion,
  with a free-text `detail` (for a task update: `status: Open -> Completed`).
  `actor_id` is nullable today and will be filled from the authenticated user
  once role-based access control is added.
- **Notifications** are derived from tasks (overdue, due soon) or written by
  the task endpoints (assigned, status change); one row per task and type.

## Row counts after seeding

| Table | Rows |
|-------|------|
| users | 6 |
| meetings | 4 |
| segments | 27 |
| tasks | 11 |
| decisions | 7 |
| risks | 7 |
| notifications | 1 (+ overdue / due-soon rows generated on first request) |
| audit_logs | 4 |

Uploading `backend/samples/sprint8_planning.txt` adds a fifth meeting with
14 segments and its extracted records.
