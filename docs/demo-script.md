# MeetOps — Demo Script

A 6–7 minute walkthrough for the mid-term presentation and the demo video.
Everything below runs on one laptop with no internet connection.

## Before the demo

1. Start the database and API (terminal 1, repository root, venv active):
   ```
   docker compose -f backend/docker-compose.yml up -d     # optional: PostgreSQL
   cd backend
   python -m app.seed --reset
   python -m uvicorn app.main:app --port 8000
   ```
2. Start the dashboard (terminal 2): `cd frontend && npm run dev`, open
   http://localhost:5173 and confirm the badge says **Live**.
3. Have `backend/samples/sprint8_planning.txt` ready to upload.
4. Open http://localhost:8000/docs in a second tab (API documentation) and
   http://localhost:8000/api/health (shows database and model version).

## Walkthrough

| Min | Screen | What to say / do |
|-----|--------|------------------|
| 0:00 | Dashboard | "MeetOps turns a meeting into tasks, decisions and risks you can track." Point at the totals, the chart, the Live badge. |
| 0:45 | Upload | Choose the sample transcript, title "Sprint 8 Planning", today's date, submit. Narrate the stages as they light up: preprocess (segmentation and cleaning), classify (the trained model), extract (owner, deadline, severity), save. |
| 1:45 | Meeting detail | Show the summary and the transcript with a category and confidence per line. Click a task's evidence link to show the highlighted line. Mention one miss (Kasun's "can you connect the dashboard") as a known limitation of the classifier and how it is measured. |
| 3:00 | Task tracker | Filter to this meeting. Show owner and deadline extracted from "I'll finish … by Friday". Change a status; open the bell to show the notification. |
| 3:45 | Risk log | Show severity and the recurring flag; explain the similarity check against earlier meetings. |
| 4:15 | Insights | Completion rate, workload per person, recurring risks. |
| 4:45 | API docs | http://localhost:8000/docs: the same endpoints the dashboard calls. Health shows `model: logreg (v3)` and the database type. |
| 5:15 | ML results | Switch to the slides: dataset (AMI, 1,993 labelled utterances), protocol (cross-validation, held-out meetings), v1 → v2 → v3 table, confusion matrix, error analysis, next steps. |
| 6:30 | Close | Progress against the proposal timeline and the plan for semester 2. |

## If something goes wrong

- Backend not reachable: the dashboard switches to **Demo data** by itself;
  every screen still works, only uploads need the API.
- Port 8000 busy: `python -m uvicorn app.main:app --port 8010` and start the
  dashboard with `VITE_PROXY_TARGET=http://localhost:8010 npm run dev`.
- Reset the data at any time: `python -m app.seed --reset`.

## Recording the video

Record the walkthrough above with the Windows Game Bar (Win + G) or OBS at
1080p, microphone on, 6–7 minutes. Keep the browser at 100 % zoom and the
sidebar visible. Save as `docs/demo.mp4` or upload it and put the link in the
README.
