# MeetOps — Features

Screenshots are taken from the running application (backend live, database
prepared with `python -m app.seed --demo`, signed in as the administrator).

## 1. Accounts, departments and roles

- **First run:** on an empty database the app asks for the first
  administrator (name, email, department, password). No account is built in.
- **Team page:** the administrator creates departments and one account per
  person, sets the role, job title and department, resets passwords and
  deactivates people who leave.
- **Roles:** *Admin* changes everything; *Manager* reviews and edits items from
  their department's meetings; *Member* updates their own tasks and reviews
  items from meetings they attended. The server enforces this on every
  request; the interface hides actions a person may not take.
- Speakers in a transcript are matched to accounts by name, so tasks are
  assigned to real people and appear in their *My work*.

## 2. My work (home)

![My work](screenshots/home.png)

- Personal counts: open tasks, due this week, overdue, items waiting for
  review; each opens the matching filtered list.
- My tasks grouped by Overdue / Today / This week / Later / No due date, with
  inline status, owner, due date and priority.
- Recent meetings with what still needs review, and an activity feed built
  from the audit log ("Ravindu moved … to Completed").

## 3. New meeting and the processing pipeline

![New meeting](screenshots/upload.png)

Upload a transcript with title, date and department. The page follows the
backend through `upload → transcribe → preprocess → classify → extract →
save` and then links to the meeting and its review items. Text transcripts
(`Speaker: text`, optional `[hh:mm:ss]`) are processed end-to-end; audio and
video are accepted and reported as "transcription in the next phase".

What happens inside:

- **Classify:** the TF-IDF model labels every sentence; a rule layer then
  corrects explicit requests, commitments, agreements and concerns, and
  removes agenda lines and open questions (`ml/README.md` §3.7–3.8).
- **Organise:** a request and its acceptance become one task; titles are
  rewritten as actions; owner and due date come from whoever was asked or
  accepted and whatever time was said; vague agreements quote what was
  agreed; duplicates are merged.
- **Review state:** confident model predictions are confirmed automatically;
  everything else is a *suggestion* for a person to confirm.

## 4. Review

![Review](screenshots/review.png)

Everything the system was not sure about, grouped by meeting, with the
evidence line, owner, due date and the model's confidence (or *Rule* when a
rule found it). Confirm or reject one item or a whole meeting; every
rejection is stored as label feedback for retraining, and can be undone.

## 5. Meeting page

![Meeting](screenshots/meeting-detail.png)

- The transcript, one sentence per line, with its label and confidence. When
  the rule layer changed the model's label, the line says so ("model said
  Other · rule: request").
- **Correct any line:** hover a line and mark it as Task, Decision, Risk or
  Other. The register entry is created or removed immediately and the
  correction is saved as feedback. This is how a missed task is added.
- Extractive summary, and the meeting's tasks, decisions and risks with
  review buttons and owners. Every item links back to its line
  (`/meetings/{id}?segment=…`), which is highlighted on arrival.

## 6. Tasks

![Tasks list](screenshots/task-tracker.png)
![Tasks board](screenshots/task-board.png)

- **List** grouped by due date, status, owner or meeting; **Board** with Open
  / In progress / Completed columns, drag a card to change its status.
- Filters: search, status, owner (*Me*, *Unassigned* or a person),
  department, meeting, review state, priority, overdue, due-date range,
  meeting-date range. Filters are kept in the URL.
- Inline owner, due date (the phrase said in the meeting is kept, e.g.
  "before the go-live"), status and priority; new task by hand; CSV export.
- Changing a status notifies the owner and the meeting's uploader and writes
  the audit log; completing a task records when, for on-time statistics.

## 7. Decisions

![Decisions](screenshots/decision-register.png)

Decision register: statement, who decided, date, meeting and department,
evidence line; filters by meeting, person, department, review state and date
range; edit the wording; confirm / reject; CSV export.

## 8. Risks

![Risks](screenshots/risk-log.png)

Risk log: severity (High / Medium / Low, from cue words), status (Open /
Mitigated / Closed), owner, who raised it, and a **Recurring** flag when a
similar risk was raised in an earlier meeting (TF-IDF cosine similarity).
Summary counts for open, high, recurring and unowned risks; filters; CSV
export.

## 9. Insights

![Insights](screenshots/insights.png)

Task completion rate, on-time delivery, overdue now, review acceptance rate;
tasks created vs completed per week; open risks by severity; workload per
person; per-department open, overdue and completion; extracted items per
meeting; recurring risks.

## 10. Team

![Team](screenshots/team.png)

People with department, job title and role; departments with member counts;
administrators add, edit, reset passwords and deactivate.

## 11. Everywhere

- **Ctrl K** command palette: jump to any page or search meetings, tasks,
  decisions, risks and transcript text.
- Notifications: overdue, due soon, assigned, status changed, review needed.
- Light, dark or system theme; responsive layout down to phone width.
- Lists refresh in the background, so changes made by colleagues appear
  without reloading.

## 12. Planned for the next phase

Audio/video ingestion (FFmpeg + Whisper), DistilBERT classifier with context
features trained on the collected label feedback, learned owner/deadline
extraction, email reminders for deadlines, PDF export of the registers.
