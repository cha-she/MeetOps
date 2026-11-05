# MeetOps — Demo Script

A 7–8 minute walkthrough for the mid-term presentation and the demo video.
Everything runs on one laptop with no internet connection.

## Before the demo

1. Prepare the data and start the API (terminal 1, repository root, venv active):
   ```
   cd backend
   python -m app.seed --demo
   python -m uvicorn app.main:app --port 8000
   ```
   (Optional, to show PostgreSQL: `docker compose up -d` in `backend/` and set
   `DATABASE_URL` in `backend/.env` before seeding.)
2. Start the dashboard (terminal 2): `cd frontend && npm run dev`, open
   http://localhost:5173 and sign in as the administrator
   (`chanya@meetops.demo`, password in `backend/app/seed.py`).
3. Have `backend/samples/website_redesign_kickoff.txt` ready for the live upload.
4. Second browser tab: http://localhost:8000/docs (API documentation).

## Walkthrough

| Min | Screen | What to say / do |
|-----|--------|------------------|
| 0:00 | My work | "MeetOps turns meetings into tasks, decisions and risks, each traceable to the sentence it came from." Personal counts, my tasks grouped by due date, activity feed. |
| 0:45 | New meeting | Upload `website_redesign_kickoff.txt`, title "Website Redesign Kickoff", department Product. Narrate the stages: preprocess (split and clean), classify (model + rule layer), extract (owners, deadlines, merged replies), save. |
| 1:45 | Meeting page | Transcript: each line has a label and confidence; point at a line marked "model said Other · rule: request". Show the task "Contact their IT team and get the API documentation", owner Ravindu, due Friday: the request and his "Sure, I'll email them" became one task. |
| 2:45 | Correct a miss | "I can build the new landing page this week" was missed. Hover, **+**, *Add as task*: the line's text is filled in, pick Kasun, and it appears in his tasks; the correction is stored as training feedback. A wrong type: reject the item, then add the right one the same way. "The system proposes, people confirm." |
| 3:30 | Review | Uncertain items grouped by meeting; confirm a few, reject one wrong one (undo exists). Explain why every DistilBERT item is reviewed (measured over-confidence, ml/README.md 3.12). |
| 4:15 | Tasks | Filter Owner = Me, then Overdue; switch to Board and move a card to In progress. Show export. |
| 4:45 | Risks / Decisions | Severity, status, owner, recurring flag; switch Risks to **Themes**: all risks grouped by meaning across meetings. Decision register with who decided. Open a meeting and click **Minutes PDF**. |
| 5:15 | Insights + Team | Completion and on-time rates, workload, departments. Team page: roles (admin / manager / member). Sign in as a member (`kasun@meetops.demo`) to show they can only change their own tasks. |
| 6:00 | ML results | Slides: dataset (AMI, 2,600 labelled training lines, 875-line test set of 4 unseen meetings, 89 business lines), TF-IDF v3/v4 vs DistilBERT v6 (macro-F1 0.48 → 0.56 on AMI, 0.36 → 0.65 on business meetings, 0.78 with rules), over-confidence, extraction results, the v7 retraining that the gate rejected. |
| 7:15 | Close | Progress against the proposal timeline; remaining weeks: evidence audio clips and deadline-change tracking, speech evaluation on AMI recordings and email reminders, learned extraction, final testing and report. |

## If something goes wrong

- "Cannot reach the MeetOps server": the API is not running; start it (step 1).
  The dashboard never falls back to sample data.
- Port 8000 busy: `python -m uvicorn app.main:app --port 8010` and start the
  dashboard with `VITE_PROXY_TARGET=http://localhost:8010 npm run dev`.
- Start over: `python -m app.seed --demo` (signed-in sessions stay valid).

## Recording the video

Record with the Windows Game Bar (Win + G) or OBS at 1080p, microphone on.
Keep the browser at 100 % zoom. Save as `docs/demo.mp4` or upload it and put
the link in the README.
