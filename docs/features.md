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
  their department's meetings and decides who does a task and by when;
  *Member* updates the status of their own tasks and reviews items from
  meetings they attended. The server enforces this on every
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

Upload a transcript or a recording with title, date and department. The page
follows the backend through `upload → transcribe → preprocess → classify →
extract → save` and then links to the meeting and its review items. Text
transcripts (`Speaker: text`, timestamps, Teams/Zoom exports, VTT/SRT, plain
minutes) are read directly. Audio and video (mp3, wav, m4a, mp4, mov …, up to
500 MB) are transcribed on the server with Whisper; voices are grouped into
Speaker 1, 2 … and named afterwards on the meeting page ("Who is who?", with
names suggested from the conversation).

What happens inside:

- **Classify:** the fine-tuned DistilBERT model labels every sentence (TF-IDF
  when PyTorch is not installed); a rule layer then
  corrects explicit requests, commitments, agreements and concerns, and
  removes agenda lines and open questions (`ml/README.md` §3.7–3.8).
- **Organise:** a request and its acceptance become one task; titles are
  rewritten as actions; owner and due date come from whoever was asked or
  accepted and whatever time was said; vague agreements quote what was
  agreed; duplicates are merged.
- **Review state:** with DistilBERT every item is a *suggestion* for a person
  to confirm (its confidence was measured to be unreliable for skipping review,
  `ml/README.md` §3.12); with TF-IDF, items the model alone is at least 80 %
  sure of are confirmed automatically.

## 4. Review

![Review](screenshots/review.png)

Everything the system was not sure about, grouped by meeting, with the
evidence line, owner, due date and the model's confidence (or *Rule* when a
rule found it). Confirm or reject one item or a whole meeting; every
confirmation and rejection is stored as label feedback for retraining, and can
be undone.

## 5. Meeting page

![Meeting](screenshots/meeting-detail.png)

- The transcript, one sentence per line, with its label and confidence. When
  the rule layer changed the model's label, the line says so ("model said
  Other · rule: request").
- **Add from a line:** hover a line, **+**, *Add as task / decision / risk*.
  The dialog is filled with the line's text and the item links to the line;
  it is saved as manual and as feedback for that line. A wrong type is fixed
  by rejecting the item and adding the right one this way, so every
  correction goes through a rejection or an added item.
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
- Inline status and priority; owner and due date (the phrase said in the
  meeting is kept, e.g. "before the go-live") are changed by an admin or the
  department's manager. The owner is a member, or any typed name for someone
  without an account (a name that matches an account is linked to it).
  New task by hand; CSV export.
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
and PDF export.

**Themes view**: every risk from all meetings (or one department) grouped by
meaning into themes, each named by its most typical words (for example
"refund · flow · payment"), with how many risks and meetings it covers, how
many are open or high, and when it was first and last raised. Uses MiniLM
sentence vectors and agglomerative clustering (`ml/README.md` §6). The top
themes also appear in Insights.

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

## 12. PDF export

- **Minutes PDF** on a processed meeting: details (date, duration,
  department, participants, source), summary, decisions, action items with
  owner, due date and status, risks with severity, and the time each item was
  said. Items still waiting for review are marked; rejected items are left out.
- **PDF** on the Tasks, Decisions and Risks registers: the rows currently
  shown (same filters), as a landscape table.
- Generated on the server with reportlab, with the same permissions as the
  API; register exports are written to the audit log.

## 13. Learning from review

Confirmations, rejections and items added from a line are saved as labels.
The **Model feedback** page shows the counts, every correction (who, when,
the model's label and the person's), whether it will be used for training
(or why not: in a test set, already in training, replaced by a later
decision), the model versions with the one in use and the rejected ones,
and a *Training CSV* download. An export script
drops sentences that are in a test set, the model is retrained, and a
comparison script deploys the new model only if it is not worse on the test
sets (`ml/README.md` §3.13). The first retraining (v7, 29 reviewed lines) was
slightly worse on the business meetings and was rejected, so v6 stays.

## 14. Planned for the next phase

Evidence audio clips (play the recording at an item's time), tracking deadline
changes later in a meeting, measured speech-to-text and speaker accuracy on
AMI recordings, learned owner/deadline extraction, email reminders for
deadlines.
