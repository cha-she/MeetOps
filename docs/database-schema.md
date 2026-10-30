# MeetOps — Database Schema

Implemented in `backend/app/models.py` with SQLAlchemy 2. The same schema runs
on PostgreSQL 16 (target, via `backend/docker-compose.yml`) and on SQLite
(development default, file `backend/meetops.db`). Tables are created on
start-up; `python -m app.seed --empty` or `--demo` recreates them.

## Entity-relationship diagram

```mermaid
erDiagram
    DEPARTMENTS ||--o{ USERS : employs
    DEPARTMENTS |o--o{ MEETINGS : owns
    USERS ||--o{ MEETING_PARTICIPANTS : attends
    MEETINGS ||--o{ MEETING_PARTICIPANTS : has
    USERS |o--o{ MEETINGS : uploaded
    MEETINGS ||--o{ SEGMENTS : "is split into"
    MEETINGS ||--o{ TASKS : produces
    MEETINGS ||--o{ DECISIONS : produces
    MEETINGS ||--o{ RISKS : produces
    SEGMENTS |o--o{ TASKS : "evidence for"
    SEGMENTS |o--o{ DECISIONS : "evidence for"
    SEGMENTS |o--o{ RISKS : "evidence for"
    USERS |o--o{ TASKS : owns
    USERS |o--o{ DECISIONS : "decided by"
    USERS |o--o{ RISKS : owns
    USERS ||--o{ NOTIFICATIONS : receives
    USERS |o--o{ AUDIT_LOGS : actor
    SEGMENTS |o--o{ LABEL_FEEDBACK : corrected
    USERS |o--o{ LABEL_FEEDBACK : "corrected by"

    DEPARTMENTS {
        int id PK
        string name UK
        datetime created_at
    }
    USERS {
        int id PK
        string name
        string initials
        string email UK
        string password_hash "salted scrypt"
        string role "admin | manager | member"
        string title "job title"
        int department_id FK
        bool is_active
        datetime last_login_at
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
        int department_id FK
        int uploaded_by_id FK
        string model_name "classifier used"
        datetime created_at
    }
    MEETING_PARTICIPANTS {
        int meeting_id PK, FK
        int user_id PK, FK
    }
    SEGMENTS {
        int id PK
        int meeting_id FK
        int position
        string speaker
        float start_sec
        text text
        string category "final label"
        float confidence
        string model_label "model alone"
        string rule "rule that changed it"
        bool corrected "relabelled by a person"
    }
    TASKS {
        int id PK
        int meeting_id FK
        int segment_id FK
        text description
        int owner_id FK
        date deadline
        string deadline_text "phrase said"
        string status "Open | In Progress | Completed"
        string priority "Low | Medium | High"
        string review_status "suggested | confirmed | rejected"
        float confidence
        string source "ai | manual"
        datetime completed_at
    }
    DECISIONS {
        int id PK
        int meeting_id FK
        int segment_id FK
        text statement
        int owner_id FK
        date decided_at
        string review_status
        float confidence
        string source
    }
    RISKS {
        int id PK
        int meeting_id FK
        int segment_id FK
        text description
        string severity "Low | Medium | High"
        string status "Open | Mitigated | Closed"
        int owner_id FK
        string raised_by
        date raised_at
        bool recurring
        string review_status
        float confidence
        string source
    }
    NOTIFICATIONS {
        int id PK
        int user_id FK
        string type "overdue | due_soon | assigned | status_change | review"
        text message
        int task_id FK
        int meeting_id FK
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
        int meeting_id
        datetime created_at
    }
    LABEL_FEEDBACK {
        int id PK
        int segment_id FK
        text text
        string predicted
        string corrected
        int user_id FK
        datetime created_at
    }
```

## Design notes

- **Evidence link.** `tasks`, `decisions` and `risks` each carry `segment_id`
  (`ON DELETE SET NULL`). The dashboard opens the meeting at that line.
- **Two labels per line.** `segments.model_label` is what the classifier said,
  `category` is the final label after the rule layer or a person's
  correction, `rule` names the rule that changed it. This keeps the model's
  own performance measurable inside the running system.
- **Review state.** Extracted items start as `suggested` unless the model
  alone was at least 0.8 confident (`confirmed`). A person confirms or
  rejects; rejected items are hidden from registers and counts but kept.
- **Learning from corrections.** Every rejection and relabel writes a
  `label_feedback` row: the sentence, the predicted label and the corrected
  one. Exported, these rows extend the training set for the next model.
- **Access control.** `users.role` and `department_id` drive the permission
  checks in `backend/app/security.py`; `meetings.department_id` and
  `uploaded_by_id` decide who may review a meeting's items.
- **Cascade rules.** Deleting a meeting deletes its segments and extracted
  items. Deleting or deactivating a person never deletes their tasks; owner
  links are set to null.
- **Indexes.** Foreign keys used by filters (`meeting_id`, `owner_id`,
  `department_id`, `user_id`) are indexed; `(meeting_id, position)` is unique
  so transcript lines keep their order.
- **Status columns as strings.** Validated by the API layer (Pydantic
  literals) rather than database enums, so SQLite and PostgreSQL behave the
  same and adding a value is a code change only.
- **Timestamps** are stored in UTC and sent to the browser marked as UTC.
  Dates people speak about (`deadline`, `decided_at`) are plain dates.

## After `python -m app.seed --demo`

| Table | Rows |
|-------|------|
| departments | 4 |
| users | 6 |
| meetings | 4 (processed by the real pipeline) |
| segments | 98 |
| tasks / decisions / risks | 16 / 11 / 13 |
| audit_logs | one per account and per meeting upload and processing |
