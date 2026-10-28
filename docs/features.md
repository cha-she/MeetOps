# MeetOps — Features

Screenshots are taken from the running application (backend live, SQLite
database seeded with `python -m app.seed --reset`, plus one transcript
uploaded from `backend/samples/sprint8_planning.txt`).

## 1. Dashboard

![Dashboard](screenshots/dashboard.png)

- Totals for open tasks (with overdue count), decisions, risks (with high
  severity count) and processed meetings, each linking to its page.
- "Extracted items per meeting" chart (tasks / decisions / risks) and task
  status donut, both computed by `GET /api/insights/summary`.
- Recent meetings and upcoming deadlines.
- The **Live** badge shows the dashboard is reading from the API; when the
  backend is not running it says **Demo data** and uses a built-in dataset.
- Global search box and a notifications bell (overdue, due soon, assigned,
  status change).

## 2. Meetings

![Meetings](screenshots/meetings.png)

Every uploaded meeting with its source type (audio / video / transcript),
processing status, participants, duration and how many tasks, decisions and
risks were extracted. Search by title.

## 3. Meeting detail with evidence

![Meeting detail](screenshots/meeting-detail.png)

- Automatic extractive summary.
- Tabs for the tasks, decisions and risks of this meeting.
- The full transcript, one utterance per line, with the predicted category
  and the model's confidence.
- **Evidence links**: every task, decision or risk anywhere in the app links
  to the exact transcript line it came from (`/meetings/{id}?segment=…`), which
  is highlighted on arrival.

## 4. Upload and processing pipeline

![Upload](screenshots/upload.png)

Drag-and-drop or choose a file, give it a title and date, and submit. The
page polls the meeting and shows the stage the backend is in:
`upload → transcribe → preprocess → classify → extract → save`. Text
transcripts (`Speaker: text` lines, optional `[hh:mm:ss]`) are processed
end-to-end; audio and video are accepted and reported as "transcription
coming in the next phase". Failures are shown with the backend's message.

## 5. Task tracker

![Task tracker](screenshots/task-tracker.png)

- Extracted action items with owner (avatar), deadline, status and the
  meeting they came from.
- Filters: status, owner, meeting, overdue only, free text; sort by deadline.
- Change status inline (Open → In Progress → Completed). The update is sent
  with `PATCH /api/tasks/{id}`, written to the audit log, and produces a
  "status change" notification.
- Overdue and due-soon tasks are highlighted.

## 6. Decision register

![Decision register](screenshots/decision-register.png)

Agreed outcomes with who stated them, the meeting and date, and the evidence
link to the transcript.

## 7. Risk log

![Risk log](screenshots/risk-log.png)

Concerns and blockers with a severity (High / Medium / Low, from cue words in
the utterance) and a **recurring** flag when the same risk was raised in an
earlier meeting (TF-IDF cosine similarity between risk statements).

## 8. Insights

![Insights](screenshots/insights.png)

Completion rate, average items per meeting, busiest owner, task status and
risk severity breakdowns, workload per person and the list of recurring
risks.

## 9. Search

![Search](screenshots/search.png)

One query across meetings (title, summary), tasks (description, owner),
decisions, risks and the transcript text behind them.

## 10. Behind the screens

| Capability | Where |
|------------|-------|
| Utterance classification (Task / Decision / Risk / Other) | `ml/` package, Logistic Regression over word + character TF-IDF + risk-cue lexicon, macro-F1 0.48 on held-out meetings (see `ml/README.md`) |
| Owner and deadline extraction | `backend/app/services/extraction.py`, rules + `dateparser`, relative to the meeting date |
| Extractive summary | `backend/app/services/summary.py` |
| Recurring-risk detection | same module, cosine similarity threshold 0.35 |
| Notifications | derived from task deadlines and changes |
| Audit log | `audit_logs` table, written on every API change |
| Database | PostgreSQL (Docker) or SQLite, see `docs/database-schema.md` |
| Tests | `frontend` lint + type-check + build, `backend/tests`, `ml/tests`, all run in GitHub Actions |

## 11. Planned for the next phase

Audio/video ingestion (FFmpeg + Whisper), DistilBERT classifier with context
features, learned owner/deadline extraction, role-based access control with
personal accounts, email reminders for deadlines, PDF export of the decision
register, and theme / appearance settings.
