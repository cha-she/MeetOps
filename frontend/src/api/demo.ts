// ---------------------------------------------------------------------------
// Demo data source.
//
// The frontend normally talks to the FastAPI backend. When the backend is not
// reachable (or VITE_DEMO_MODE=true), the app falls back to this in-memory
// implementation of the same API surface so every screen can be demonstrated.
// Dates are generated relative to "today" so deadlines and overdue flags stay
// meaningful whenever the demo is opened.
// ---------------------------------------------------------------------------

import { ApiError } from "./client";
import type {
  Decision,
  InsightsSummary,
  Meeting,
  Notification,
  Risk,
  SearchResults,
  Task,
  TaskStatus,
  TranscriptSegment,
  User,
} from "../types";

const pad = (n: number) => String(n).padStart(2, "0");

function isoDaysFromToday(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isoDateTimeDaysAgo(days: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

// --- People -----------------------------------------------------------------

const users: User[] = [
  { id: 1, name: "Chanya Shehani", initials: "CS", role: "Admin" },
  { id: 2, name: "Ravindu Perera", initials: "RP", role: "Backend Engineer" },
  { id: 3, name: "Nethmi Fernando", initials: "NF", role: "ML Engineer" },
  { id: 4, name: "Kasun Silva", initials: "KS", role: "Frontend Engineer" },
  { id: 5, name: "Ishara Jayasuriya", initials: "IJ", role: "QA / PMO" },
  { id: 6, name: "Dilini Wickrama", initials: "DW", role: "Product Manager" },
];
const u = (id: number) => users.find((x) => x.id === id)!;

// --- Meetings -----------------------------------------------------------------

type MeetingSeed = Omit<Meeting, "taskCount" | "decisionCount" | "riskCount" | "participants"> & {
  participantIds: number[];
};

const meetingSeeds: MeetingSeed[] = [
  {
    id: 1,
    title: "Sprint 7 Planning",
    date: isoDaysFromToday(-3),
    durationMin: 52,
    source: "video",
    status: "Processed",
    pipelineStage: null,
    errorMessage: null,
    participantIds: [1, 2, 3, 4, 5],
    summary:
      "Scoped Sprint 7 around the classification model and the task tracker UI. Agreed to freeze the segment schema and prioritise the AMI subset annotation. Two risks flagged around annotation throughput and ASR accuracy on overlapping speech.",
    createdAt: isoDateTimeDaysAgo(3),
  },
  {
    id: 2,
    title: "Client Review — Northwind SME",
    date: isoDaysFromToday(-6),
    durationMin: 41,
    source: "audio",
    status: "Processed",
    pipelineStage: null,
    errorMessage: null,
    participantIds: [1, 6, 2],
    summary:
      "Walked Northwind through the decision register and risk log. Client requested export to PDF and a weekly digest email. Approved the RBAC roles for their PMO team.",
    createdAt: isoDateTimeDaysAgo(6),
  },
  {
    id: 3,
    title: "ML Model Sync",
    date: isoDaysFromToday(-8),
    durationMin: 34,
    source: "transcript",
    status: "Processed",
    pipelineStage: null,
    errorMessage: null,
    participantIds: [3, 1, 2],
    summary:
      "Reviewed baseline results: TF-IDF + Linear SVM at 0.81 macro-F1 on the labelled subset. Decided to trial DistilBERT fine-tuning. Risks around class imbalance for the Risk category and limited labelled data.",
    createdAt: isoDateTimeDaysAgo(8),
  },
  {
    id: 4,
    title: "Ops Review — Week 26",
    date: isoDaysFromToday(-10),
    durationMin: 28,
    source: "video",
    status: "Processed",
    pipelineStage: null,
    errorMessage: null,
    participantIds: [1, 5, 6, 4],
    summary:
      "Reviewed overdue tasks from Sprint 6 and reassigned two items. Decided to move the demo environment to a shared staging server.",
    createdAt: isoDateTimeDaysAgo(10),
  },
  {
    id: 5,
    title: "Sprint 8 Planning",
    date: isoDaysFromToday(-1),
    durationMin: 47,
    source: "video",
    status: "Processing",
    pipelineStage: "classify",
    errorMessage: null,
    participantIds: [1, 2, 3, 4, 5, 6],
    summary: null,
    createdAt: isoDateTimeDaysAgo(1),
  },
];

// --- Transcript segments --------------------------------------------------------

const segments: Record<number, TranscriptSegment[]> = {
  1: [
    { id: 101, speaker: "Chanya", timestamp: "00:07:55", startSec: 475, text: "Okay, let's talk scope for Sprint 7. Two big things: the classifier and the task tracker UI.", category: "Other", confidence: 0.72 },
    { id: 102, speaker: "Chanya", timestamp: "00:08:12", startSec: 492, text: "Ravindu, can you lock the segment schema this week so the ML side isn't shifting under us?", category: "Task", confidence: 0.93 },
    { id: 103, speaker: "Chanya", timestamp: "00:09:40", startSec: 580, text: "Decision: we freeze the schema at the end of this sprint.", category: "Decision", confidence: 0.96 },
    { id: 104, speaker: "Nethmi", timestamp: "00:21:40", startSec: 1300, text: "I'll take the first batch of annotations, target five hundred segments by the weekend.", category: "Task", confidence: 0.91 },
    { id: 105, speaker: "Nethmi", timestamp: "00:22:15", startSec: 1335, text: "We'll focus on annotating AMI first rather than gathering more data.", category: "Decision", confidence: 0.88 },
    { id: 106, speaker: "Nethmi", timestamp: "00:24:50", startSec: 1490, text: "If annotation slips, the whole training timeline slips with it.", category: "Risk", confidence: 0.9 },
    { id: 107, speaker: "Kasun", timestamp: "00:33:05", startSec: 1985, text: "I can have the task tracker table done before the next standup.", category: "Task", confidence: 0.89 },
    { id: 108, speaker: "Ravindu", timestamp: "00:37:12", startSec: 2232, text: "Cross-talk is where Whisper starts making things up.", category: "Risk", confidence: 0.84 },
    { id: 109, speaker: "Nethmi", timestamp: "00:41:08", startSec: 2468, text: "Given the class imbalance, macro-F1 is the metric we report on.", category: "Decision", confidence: 0.87 },
    { id: 110, speaker: "Chanya", timestamp: "00:45:20", startSec: 2720, text: "Great, thanks everyone. Same time next week.", category: "Other", confidence: 0.79 },
  ],
  2: [
    { id: 201, speaker: "Dilini", timestamp: "00:15:22", startSec: 922, text: "The client explicitly asked for PDF export of the decision register.", category: "Task", confidence: 0.86 },
    { id: 202, speaker: "Dilini", timestamp: "00:19:03", startSec: 1143, text: "They'd love a weekly digest so nothing slips through the cracks.", category: "Task", confidence: 0.81 },
    { id: 203, speaker: "Chanya", timestamp: "00:27:44", startSec: 1664, text: "Approved — five roles, with HR and finance on the restricted viewer tier.", category: "Decision", confidence: 0.92 },
    { id: 204, speaker: "Dilini", timestamp: "00:31:10", startSec: 1870, text: "Both of those are must-haves for the pilot, let's commit to them.", category: "Decision", confidence: 0.85 },
    { id: 205, speaker: "Dilini", timestamp: "00:34:18", startSec: 2058, text: "The pilot date is fixed, and we still owe them exports.", category: "Risk", confidence: 0.83 },
  ],
  3: [
    { id: 301, speaker: "Nethmi", timestamp: "00:11:47", startSec: 707, text: "Let's spin up a DistilBERT run and compare it against the SVM baseline.", category: "Task", confidence: 0.9 },
    { id: 302, speaker: "Nethmi", timestamp: "00:13:20", startSec: 800, text: "We try DistilBERT, but the SVM stays as our safety net.", category: "Decision", confidence: 0.88 },
    { id: 303, speaker: "Ravindu", timestamp: "00:24:18", startSec: 1458, text: "The transcripts get messy when two people talk over each other.", category: "Task", confidence: 0.74 },
    { id: 304, speaker: "Nethmi", timestamp: "00:28:40", startSec: 1720, text: "We have far fewer Risk examples than Tasks, that'll hurt recall.", category: "Risk", confidence: 0.91 },
    { id: 305, speaker: "Nethmi", timestamp: "00:29:02", startSec: 1742, text: "The Risk class is starved — we need more labelled risk examples.", category: "Task", confidence: 0.82 },
    { id: 306, speaker: "Ravindu", timestamp: "00:31:55", startSec: 1915, text: "Three thousand segments is thin for a transformer.", category: "Risk", confidence: 0.8 },
    { id: 307, speaker: "Nethmi", timestamp: "00:33:02", startSec: 1982, text: "AMI is meetings, but not our client's exact domain.", category: "Risk", confidence: 0.77 },
  ],
  4: [
    { id: 401, speaker: "Ishara", timestamp: "00:06:55", startSec: 415, text: "I'll clean up the board and reassign the two overdue tasks today.", category: "Task", confidence: 0.92 },
    { id: 402, speaker: "Chanya", timestamp: "00:18:30", startSec: 1110, text: "Let's get the demo onto staging so everyone can hit the same build.", category: "Task", confidence: 0.85 },
    { id: 403, speaker: "Chanya", timestamp: "00:19:02", startSec: 1142, text: "Agreed, staging becomes the single demo environment.", category: "Decision", confidence: 0.9 },
    { id: 404, speaker: "Ishara", timestamp: "00:21:40", startSec: 1300, text: "Let's not migrate the day before the demo.", category: "Risk", confidence: 0.78 },
    { id: 405, speaker: "Dilini", timestamp: "00:23:11", startSec: 1391, text: "We need the evaluation deck ready well before the review.", category: "Task", confidence: 0.87 },
  ],
};

const seg = (id: number) =>
  Object.values(segments)
    .flat()
    .find((s) => s.id === id)!;

const evidenceFrom = (segmentId: number) => {
  const s = seg(segmentId);
  return { segmentId, speaker: s.speaker, timestamp: s.timestamp, quote: s.text };
};

// --- Tasks, decisions, risks -----------------------------------------------------

type TaskSeed = { id: number; description: string; ownerId: number | null; meetingId: number; deadline: number | null; status: TaskStatus; segmentId: number };

const taskSeeds: TaskSeed[] = [
  { id: 1, description: "Freeze the transcript segment schema and document the fields", ownerId: 2, meetingId: 1, deadline: 1, status: "In Progress", segmentId: 102 },
  { id: 2, description: "Annotate the first 500 AMI segments in Label Studio", ownerId: 3, meetingId: 1, deadline: 4, status: "In Progress", segmentId: 104 },
  { id: 3, description: "Build the Task Tracker table with status and deadline columns", ownerId: 4, meetingId: 1, deadline: 2, status: "Completed", segmentId: 107 },
  { id: 4, description: "Add PDF export for the decision register", ownerId: 4, meetingId: 2, deadline: 6, status: "Open", segmentId: 201 },
  { id: 5, description: "Implement weekly digest email for task owners", ownerId: 2, meetingId: 2, deadline: 9, status: "Open", segmentId: 202 },
  { id: 6, description: "Set up DistilBERT fine-tuning experiment on the labelled subset", ownerId: 3, meetingId: 3, deadline: -2, status: "Open", segmentId: 301 },
  { id: 7, description: "Fix overlapping-speech handling in the ASR preprocessing step", ownerId: 2, meetingId: 3, deadline: -4, status: "In Progress", segmentId: 303 },
  { id: 8, description: "Reassign Sprint 6 overdue items and update the board", ownerId: 5, meetingId: 4, deadline: -7, status: "Completed", segmentId: 401 },
  { id: 9, description: "Migrate the demo environment to the shared staging server", ownerId: 4, meetingId: 4, deadline: 0, status: "In Progress", segmentId: 402 },
  { id: 10, description: "Prepare mid-progress evaluation slide deck", ownerId: 1, meetingId: 4, deadline: 2, status: "In Progress", segmentId: 405 },
  { id: 11, description: "Balance the Risk class with additional labelled examples", ownerId: 3, meetingId: 3, deadline: 3, status: "Open", segmentId: 305 },
];

let tasks: Task[] = taskSeeds.map((t) => ({
  id: t.id,
  description: t.description,
  owner: t.ownerId ? u(t.ownerId) : null,
  meetingId: t.meetingId,
  meetingTitle: meetingSeeds.find((m) => m.id === t.meetingId)!.title,
  deadline: t.deadline === null ? null : isoDaysFromToday(t.deadline),
  status: t.status,
  createdAt: meetingSeeds.find((m) => m.id === t.meetingId)!.createdAt,
  evidence: evidenceFrom(t.segmentId),
}));

const decisions: Decision[] = [
  { id: 1, statement: "Freeze the segment schema after Sprint 7; no further field changes without sign-off.", ownerId: 1, meetingId: 1, segmentId: 103 },
  { id: 2, statement: "Prioritise annotating the AMI subset over collecting new recordings.", ownerId: 3, meetingId: 1, segmentId: 105 },
  { id: 3, statement: "Adopt macro-F1 as the primary classification metric for evaluation.", ownerId: 3, meetingId: 1, segmentId: 109 },
  { id: 4, statement: "Approve the RBAC role set (Admin, Manager, Lead, Staff, Viewer) for the client.", ownerId: 1, meetingId: 2, segmentId: 203 },
  { id: 5, statement: "Ship PDF export and weekly digest before the client pilot.", ownerId: 6, meetingId: 2, segmentId: 204 },
  { id: 6, statement: "Trial DistilBERT fine-tuning; keep SVM as the fallback baseline.", ownerId: 3, meetingId: 3, segmentId: 302 },
  { id: 7, statement: "Move the demo environment to the shared staging server.", ownerId: 1, meetingId: 4, segmentId: 403 },
].map((d) => {
  const m = meetingSeeds.find((x) => x.id === d.meetingId)!;
  return {
    id: d.id,
    statement: d.statement,
    owner: u(d.ownerId),
    meetingId: d.meetingId,
    meetingTitle: m.title,
    decidedAt: m.date,
    evidence: evidenceFrom(d.segmentId),
  };
});

const risks: Risk[] = [
  { id: 1, description: "Annotation throughput may not keep pace with the model training schedule.", meetingId: 1, severity: "High", recurring: true, segmentId: 106 },
  { id: 2, description: "ASR accuracy drops on overlapping / cross-talk speech segments.", meetingId: 1, severity: "Medium", recurring: true, segmentId: 108 },
  { id: 3, description: "Class imbalance for the Risk category could bias the classifier.", meetingId: 3, severity: "High", recurring: false, segmentId: 304 },
  { id: 4, description: "Limited labelled data may cap achievable model accuracy.", meetingId: 3, severity: "Medium", recurring: false, segmentId: 306 },
  { id: 5, description: "Single dependency on the AMI corpus limits domain generalisation.", meetingId: 3, severity: "Low", recurring: false, segmentId: 307 },
  { id: 6, description: "Client pilot deadline is tight given the export features backlog.", meetingId: 2, severity: "Medium", recurring: false, segmentId: 205 },
  { id: 7, description: "Staging migration may cause demo downtime during the review week.", meetingId: 4, severity: "Low", recurring: false, segmentId: 404 },
].map((r) => {
  const m = meetingSeeds.find((x) => x.id === r.meetingId)!;
  return {
    id: r.id,
    description: r.description,
    meetingId: r.meetingId,
    meetingTitle: m.title,
    severity: r.severity as Risk["severity"],
    raisedAt: m.date,
    recurring: r.recurring,
    evidence: evidenceFrom(r.segmentId),
  };
});

function buildMeeting(m: MeetingSeed): Meeting {
  const { participantIds, ...rest } = m;
  return {
    ...rest,
    participants: participantIds.map(u),
    taskCount: tasks.filter((t) => t.meetingId === m.id).length,
    decisionCount: decisions.filter((d) => d.meetingId === m.id).length,
    riskCount: risks.filter((r) => r.meetingId === m.id).length,
  };
}

// --- Notifications ------------------------------------------------------------------

let notificationsRead = false;

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(iso + "T00:00:00").getTime() - today.getTime()) / 86_400_000);
}

function buildNotifications(): Notification[] {
  const out: Notification[] = [];
  let id = 1;
  for (const t of tasks) {
    if (t.status === "Completed") continue;
    const d = daysUntil(t.deadline);
    if (d === null) continue;
    if (d < 0) {
      out.push({ id: id++, type: "overdue", message: `“${t.description}” is overdue by ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} (${t.owner?.name ?? "Unassigned"}).`, taskId: t.id, read: notificationsRead, createdAt: isoDateTimeDaysAgo(0, 8) });
    } else if (d <= 2) {
      out.push({ id: id++, type: "due_soon", message: `“${t.description}” is due ${d === 0 ? "today" : d === 1 ? "tomorrow" : "in 2 days"}.`, taskId: t.id, read: notificationsRead, createdAt: isoDateTimeDaysAgo(0, 8) });
    }
  }
  out.push({ id, type: "assigned", message: "You were assigned “Prepare mid-progress evaluation slide deck”.", taskId: 10, read: true, createdAt: isoDateTimeDaysAgo(10, 11) });
  return out;
}

// --- Insights -----------------------------------------------------------------------

function buildInsights(): InsightsSummary {
  const meetings = meetingSeeds.map(buildMeeting);
  const processed = meetings.filter((m) => m.status === "Processed");
  const openTasks = tasks.filter((t) => t.status !== "Completed");
  const overdue = openTasks.filter((t) => {
    const d = daysUntil(t.deadline);
    return d !== null && d < 0;
  });
  const count = (fn: (t: Task) => boolean) => tasks.filter(fn).length;

  const workload = users
    .map((p) => ({
      name: p.name.split(" ")[0],
      open: count((t) => t.owner?.id === p.id && t.status === "Open"),
      inProgress: count((t) => t.owner?.id === p.id && t.status === "In Progress"),
      completed: count((t) => t.owner?.id === p.id && t.status === "Completed"),
    }))
    .filter((w) => w.open + w.inProgress + w.completed > 0);

  const ownerCounts = new Map<string, number>();
  for (const t of tasks) if (t.owner) ownerCounts.set(t.owner.name, (ownerCounts.get(t.owner.name) ?? 0) + 1);
  const topOwner = [...ownerCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const totalItems = tasks.length + decisions.length + risks.length;

  return {
    totals: {
      meetings: meetings.length,
      processedMeetings: processed.length,
      processingMeetings: meetings.filter((m) => m.status === "Processing" || m.status === "Queued").length,
      tasks: tasks.length,
      openTasks: openTasks.length,
      overdueTasks: overdue.length,
      decisions: decisions.length,
      risks: risks.length,
      highRisks: risks.filter((r) => r.severity === "High").length,
    },
    taskStatus: (["Open", "In Progress", "Completed"] as TaskStatus[]).map((s) => ({ name: s, value: count((t) => t.status === s) })),
    riskSeverity: (["High", "Medium", "Low"] as const).map((s) => ({ name: s, value: risks.filter((r) => r.severity === s).length })),
    itemsPerMeeting: processed.map((m) => ({
      name: m.title.length > 16 ? m.title.slice(0, 15) + "…" : m.title,
      tasks: m.taskCount,
      decisions: m.decisionCount,
      risks: m.riskCount,
    })),
    workload,
    recurringRisks: risks.filter((r) => r.recurring),
    completionRate: tasks.length ? (count((t) => t.status === "Completed") / tasks.length) * 100 : 0,
    avgItemsPerMeeting: processed.length ? totalItems / processed.length : 0,
    topOwner,
  };
}

// --- Public demo API (same surface as endpoints.ts) ------------------------------------

const contains = (hay: string | null | undefined, q: string) => (hay ?? "").toLowerCase().includes(q);

export const demoApi = {
  async health() {
    return { status: "demo", version: "demo" };
  },

  async listMeetings(params?: { q?: string; limit?: number }) {
    await delay();
    let list = meetingSeeds.map(buildMeeting).sort((a, b) => b.date.localeCompare(a.date));
    if (params?.q) list = list.filter((m) => contains(m.title, params.q!.toLowerCase()));
    if (params?.limit) list = list.slice(0, params.limit);
    return list;
  },

  async getMeeting(id: number | string) {
    await delay();
    const m = meetingSeeds.find((x) => x.id === Number(id));
    if (!m) throw new ApiError("Meeting not found", 404);
    return buildMeeting(m);
  },

  async getSegments(id: number | string) {
    await delay();
    return segments[Number(id)] ?? [];
  },

  async uploadMeeting(_form: FormData): Promise<Meeting> {
    await delay();
    throw new ApiError(
      "Uploads need the backend. Start the API server to process a real transcript.",
      503
    );
  },

  async deleteMeeting(_id: number) {
    await delay();
  },

  async listTasks(params?: { status?: TaskStatus | ""; meetingId?: number; ownerId?: number; q?: string; overdue?: boolean; sort?: "deadline" | "created"; limit?: number }) {
    await delay();
    let list = [...tasks];
    if (params?.status) list = list.filter((t) => t.status === params.status);
    if (params?.meetingId) list = list.filter((t) => t.meetingId === params.meetingId);
    if (params?.ownerId) list = list.filter((t) => t.owner?.id === params.ownerId);
    if (params?.q) list = list.filter((t) => contains(t.description, params.q!.toLowerCase()));
    if (params?.overdue) list = list.filter((t) => t.status !== "Completed" && (daysUntil(t.deadline) ?? 1) < 0);
    if (params?.sort === "deadline") list.sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
    if (params?.limit) list = list.slice(0, params.limit);
    return list;
  },

  async updateTask(id: number, patch: Partial<Pick<Task, "status" | "deadline" | "description">> & { ownerId?: number | null }) {
    await delay(150);
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) throw new ApiError("Task not found", 404);
    const { ownerId, ...rest } = patch;
    const updated: Task = {
      ...tasks[idx],
      ...rest,
      owner: ownerId === undefined ? tasks[idx].owner : ownerId === null ? null : u(ownerId),
    };
    tasks = tasks.map((t) => (t.id === id ? updated : t));
    return updated;
  },

  async listDecisions(params?: { meetingId?: number; q?: string }) {
    await delay();
    let list = [...decisions];
    if (params?.meetingId) list = list.filter((d) => d.meetingId === params.meetingId);
    if (params?.q) list = list.filter((d) => contains(d.statement, params.q!.toLowerCase()));
    return list;
  },

  async listRisks(params?: { meetingId?: number; severity?: string; q?: string }) {
    await delay();
    let list = [...risks];
    if (params?.meetingId) list = list.filter((r) => r.meetingId === params.meetingId);
    if (params?.severity) list = list.filter((r) => r.severity === params.severity);
    if (params?.q) list = list.filter((r) => contains(r.description, params.q!.toLowerCase()));
    return list;
  },

  async listUsers() {
    await delay();
    return users;
  },

  async insights() {
    await delay();
    return buildInsights();
  },

  async search(q: string): Promise<SearchResults> {
    await delay();
    const needle = q.toLowerCase();
    return {
      query: q,
      meetings: meetingSeeds.map(buildMeeting).filter((m) => contains(m.title, needle) || contains(m.summary, needle)),
      tasks: tasks.filter((t) => contains(t.description, needle) || contains(t.owner?.name, needle) || contains(t.evidence.quote, needle)),
      decisions: decisions.filter((d) => contains(d.statement, needle) || contains(d.evidence.quote, needle)),
      risks: risks.filter((r) => contains(r.description, needle) || contains(r.evidence.quote, needle)),
    };
  },

  async listNotifications() {
    await delay(150);
    return buildNotifications();
  },

  async markNotificationsRead() {
    notificationsRead = true;
  },
};
