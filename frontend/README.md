# MeetOps — Frontend

**Intelligent Enterprise Meeting Management System**

MeetOps converts meeting inputs (audio, video, or transcript) into structured
enterprise records — **Tasks, Decisions, and Risks** — with owners, deadlines,
evidence traceability, dashboards, and analytics.

This repository contains the **React frontend** for the mid-progress demo. It is
fully interactive and runs on **mock data** so every screen can be presented
before the ML/backend pipeline is wired in.

## Tech stack

- **React 18** + **TypeScript**
- **Vite** (dev server & build)
- **Tailwind CSS** (styling)
- **React Router** (navigation)
- **Recharts** (charts)
- **lucide-react** (icons)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server (opens http://localhost:5173)
npm run dev

# 3. Production build
npm run build && npm run preview
```

> Requires Node.js 18+.

## Screens

| Route | Screen | What it shows |
|-------|--------|---------------|
| `/` | **Dashboard** | KPI cards, extraction charts, recent meetings, upcoming deadlines |
| `/upload` | **Upload Meeting** | Drag-and-drop ingest with a simulated processing pipeline (FFmpeg → Whisper → classification → extraction) |
| `/meetings` | **Meetings** | List of ingested meetings with participants and counts |
| `/meetings/:id` | **Meeting Detail** | Classified transcript (Task/Decision/Risk/Other + confidence), AI summary, and extracted records with **evidence quotes** |
| `/tasks` | **Task Tracker** | Filterable table with owner, deadline, overdue flags, and editable status |
| `/decisions` | **Decision Register** | Decisions with owner and source evidence |
| `/risks` | **Risk Log** | Risks by severity, recurring-issue flags, evidence |
| `/insights` | **Insights** | Category mix, risk severity, per-owner workload, recurring risks |

## Project structure

```
src/
  main.tsx            App entry (router)
  App.tsx             Routes
  index.css           Tailwind + component classes
  types.ts            Domain types (Meeting, Task, Decision, Risk, …)
  data/
    mockData.ts       Sample data — swap for API calls later
  components/
    Layout.tsx        Sidebar + topbar shell
    ui.tsx            Badges, avatars, helpers (dates, overdue logic)
  pages/              One file per screen
```

## Connecting a backend later

All data is currently read from `src/data/mockData.ts`. To wire up the FastAPI
backend from the proposal, replace those imports with `fetch`/`axios` calls to
your API endpoints (e.g. `GET /meetings`, `GET /tasks`) — the component props and
types already match the intended record shapes in `src/types.ts`.

---

Part of the CO3554 Data Management Project — *MeetOps*.
