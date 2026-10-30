# MeetOps — Frontend

React dashboard for **MeetOps**, the Intelligent Enterprise Meeting Management
System. People sign in with their own account and work with the records the
pipeline extracts from meetings: **Tasks, Decisions and Risks**, each with an
owner, a due date or severity, a review state, and a link back to the exact
transcript line it came from.

The dashboard only shows real data from the FastAPI backend. If the API cannot
be reached it shows a "server not reachable" screen with the command to start
it, so sample data can never be mistaken for real records.

## Tech stack

- **React 18** + **TypeScript**, **Vite** (dev server, build, `/api` proxy)
- **Tailwind CSS** with semantic colour tokens (light and dark theme)
- **React Router** (code-split routes), **Recharts** (charts), **lucide-react** (icons)
- **ESLint** + `typescript-eslint`

## Getting started

Requires Node.js 18 or newer and the backend running on port 8000
(see `../backend/README.md`).

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command             | Purpose                                   |
|---------------------|-------------------------------------------|
| `npm run lint`      | ESLint over `src/`                        |
| `npm run typecheck` | TypeScript type-check without emitting    |
| `npm run build`     | Type-check and produce `dist/`            |
| `npm run preview`   | Serve the production build locally        |

## Screens

| Route            | Screen      | What it shows |
|------------------|-------------|---------------|
| —                | Setup / Sign in | First-run creation of the administrator; sign-in for everyone else |
| `/`              | My work     | Personal counts (open, due this week, overdue, waiting for review), my tasks grouped by due date, recent meetings, activity feed |
| `/review`        | Review      | Everything extracted with low confidence or by a rule, grouped by meeting; confirm / reject one by one or a whole meeting |
| `/meetings`      | Meetings    | All meetings with department, participants, counts and review state; filters by department, participant, date |
| `/meetings/:id`  | Meeting     | Transcript with label, confidence, the model's own label and the rule that changed it; relabel any line; summary; the meeting's tasks, decisions and risks |
| `/upload`        | New meeting | Upload with title, date and department; live pipeline progress |
| `/tasks`         | Tasks       | List (grouped by due date, status, owner or meeting) and Board (drag between columns); filters for status, owner incl. *Me*/*Unassigned*, department, meeting, review, priority, overdue, due-date and meeting-date ranges; inline owner, due date, status and priority; CSV export; new task |
| `/decisions`     | Decisions   | Decision register with decided-by, date, meeting; filters; edit, confirm / reject; CSV export |
| `/risks`         | Risks       | Risk log with severity, status (open / mitigated / closed), owner, recurring flag; filters; CSV export |
| `/insights`      | Insights    | Completion and on-time rates, weekly created vs completed, workload per person, departments, risk severity, recurring risks, review acceptance |
| `/team`          | Team        | People and departments; administrators add accounts, change roles, reset passwords, deactivate |
| `/search`        | Search      | Results across meetings, tasks, decisions, risks and transcripts |

Press **Ctrl K** anywhere for the command palette (jump to a page or search).
The theme (light, dark, system) is in the account menu at the bottom of the
sidebar. Filters live in the URL, so a filtered view can be bookmarked.

## Project structure

```
src/
  api/
    client.ts           fetch wrapper: sign-in token, errors, 401 handling
    endpoints.ts        one function per API endpoint
    hooks.ts            useQuery() with background refresh and invalidate()
  auth/
    AuthContext.tsx     setup / sign-in / sign-out state
    permissions.ts      mirrors the backend role checks to hide refused actions
  components/
    Layout.tsx          sidebar, top bar, mobile drawer
    CommandPalette.tsx  Ctrl K
    NotificationsMenu.tsx
    ui.tsx              design-system primitives (panels, badges, menus, dialogs, filters, dates)
    items.tsx           domain widgets (category, review badge, confidence, owner, status, due date)
    tasks.tsx           task list, board and new-task dialog
    toast.tsx           notifications for saved changes, with undo
  hooks/                useTheme, useMutation
  pages/                one file per screen
  types.ts              API types (mirror backend/app/schemas.py)
```
