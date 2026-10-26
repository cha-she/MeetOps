# MeetOps — Frontend

React dashboard for **MeetOps**, the Intelligent Enterprise Meeting Management
System. It presents the structured records produced by the MeetOps pipeline —
**Tasks, Decisions, and Risks** — with owners, deadlines, status tracking,
evidence traceability back to the transcript, search, notifications, and
cross-meeting analytics.

Every screen reads from the FastAPI backend (`/api/...`) through a single API
layer and shows explicit empty, loading and error states. When the backend is
not reachable the app automatically switches to a built-in **demo dataset**
(`src/api/demo.ts`) that implements the same API surface, and shows a
"Demo data" badge in the top bar. This keeps the UI demonstrable at any time
without hardcoding data inside the pages.

## Tech stack

- **React 18** + **TypeScript**
- **Vite** (dev server, build, `/api` proxy)
- **Tailwind CSS**
- **React Router** (code-split routes)
- **Recharts** (charts)
- **lucide-react** (icons)
- **ESLint** + `typescript-eslint`

## Getting started

Requires Node.js 18 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

The dev server proxies `/api` to `http://localhost:8000`, where the backend
runs. Start the backend (see `../backend/README.md`) to work with real data;
without it the UI runs on the built-in demo dataset.

Other scripts:

| Command             | Purpose                                   |
|---------------------|-------------------------------------------|
| `npm run lint`      | ESLint over `src/`                        |
| `npm run typecheck` | TypeScript type-check without emitting    |
| `npm run build`     | Type-check and produce `dist/`            |
| `npm run preview`   | Serve the production build locally        |

Environment variables are documented in `.env.example`.

## Screens

| Route            | Screen            | What it shows |
|------------------|-------------------|---------------|
| `/`              | Dashboard         | KPI cards, extraction charts, recent meetings, upcoming deadlines |
| `/upload`        | Upload Meeting    | File upload with meeting title and date; live pipeline progress polled from the backend |
| `/meetings`      | Meetings          | All ingested meetings with status, participants and counts |
| `/meetings/:id`  | Meeting Detail    | Classified transcript (category + confidence), summary, extracted records with evidence quotes |
| `/tasks`         | Task Tracker      | Filterable table with owner, deadline, overdue flag, editable status |
| `/decisions`     | Decision Register | Decisions with owner, date and source evidence |
| `/risks`         | Risk Log          | Risks by severity with recurring-issue flags |
| `/insights`      | Insights          | Category mix, risk severity, workload per owner, recurring risks |
| `/search?q=`     | Search            | Global search across meetings, tasks, decisions and risks |

## Project structure

```
src/
  main.tsx                App entry (router)
  App.tsx                 Routes (lazy-loaded pages)
  config.ts               API base URL, current user, polling interval
  types.ts                Domain types matching the API JSON
  index.css               Tailwind + component classes
  api/
    client.ts             fetch wrapper with readable errors
    endpoints.ts          One function per API endpoint + live/demo switch
    demo.ts               In-memory demo dataset implementing the same API
    hooks.ts              useQuery() data-fetching hook
  components/
    Layout.tsx            Sidebar, mobile drawer, top bar, search
    NotificationsMenu.tsx Bell dropdown fed by /api/notifications
    DataSourceBadge.tsx   "Live" / "Demo data" indicator
    ui.tsx                Badges, avatars, empty/error/loading states, dates
  pages/                  One file per screen
```

## API endpoints used

| Method | Path                         | Used by |
|--------|------------------------------|---------|
| GET    | `/api/meetings`              | Dashboard, Meetings |
| POST   | `/api/meetings/upload`       | Upload Meeting |
| GET    | `/api/meetings/{id}`         | Meeting Detail, Upload (polling) |
| GET    | `/api/meetings/{id}/segments`| Meeting Detail |
| GET    | `/api/tasks`                 | Dashboard, Task Tracker, Meeting Detail |
| PATCH  | `/api/tasks/{id}`            | Task Tracker (status change) |
| GET    | `/api/decisions`             | Decision Register, Meeting Detail |
| GET    | `/api/risks`                 | Risk Log, Meeting Detail |
| GET    | `/api/insights/summary`      | Dashboard, Insights |
| GET    | `/api/search?q=`             | Search |
| GET    | `/api/notifications`         | Notifications menu |
| POST   | `/api/notifications/read-all`| Notifications menu |

Response shapes are defined in `src/types.ts`.
