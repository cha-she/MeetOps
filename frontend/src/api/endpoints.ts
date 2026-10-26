import { http } from "./client";
import { demoApi } from "./demo";
import { API_BASE_URL, DEMO_MODE } from "../config";
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

// ---------------------------------------------------------------------------
// Live API (FastAPI backend). One function per endpoint; pages never call
// fetch directly.
// ---------------------------------------------------------------------------

const liveApi = {
  health: () => http.get<{ status: string; version: string }>("/health"),

  // Meetings
  listMeetings: (params?: { q?: string; limit?: number }) =>
    http.get<Meeting[]>("/meetings", params),
  getMeeting: (id: number | string) => http.get<Meeting>(`/meetings/${id}`),
  getSegments: (id: number | string) =>
    http.get<TranscriptSegment[]>(`/meetings/${id}/segments`),
  uploadMeeting: (formData: FormData) => http.upload<Meeting>("/meetings/upload", formData),
  deleteMeeting: (id: number) => http.del<void>(`/meetings/${id}`),

  // Tasks
  listTasks: (params?: {
    status?: TaskStatus | "";
    meetingId?: number;
    ownerId?: number;
    q?: string;
    overdue?: boolean;
    sort?: "deadline" | "created";
    limit?: number;
  }) => http.get<Task[]>("/tasks", params),
  updateTask: (
    id: number,
    patch: Partial<Pick<Task, "status" | "deadline" | "description">> & { ownerId?: number | null }
  ) => http.patch<Task>(`/tasks/${id}`, patch),

  // Decisions and risks
  listDecisions: (params?: { meetingId?: number; q?: string }) =>
    http.get<Decision[]>("/decisions", params),
  listRisks: (params?: { meetingId?: number; severity?: string; q?: string }) =>
    http.get<Risk[]>("/risks", params),

  // People, insights, search, notifications
  listUsers: () => http.get<User[]>("/users"),
  insights: () => http.get<InsightsSummary>("/insights/summary"),
  search: (q: string) => http.get<SearchResults>("/search", { q }),
  listNotifications: () => http.get<Notification[]>("/notifications"),
  markNotificationsRead: () => http.post<void>("/notifications/read-all"),
};

export type MeetOpsApi = typeof liveApi;

// ---------------------------------------------------------------------------
// Data source selection.
//
// The first request probes the backend's /health endpoint. If it answers, the
// live API is used for the rest of the session; if it cannot be reached, the
// app switches to the built-in demo dataset so every screen stays usable.
// VITE_DEMO_MODE=true forces demo data regardless of the backend.
// ---------------------------------------------------------------------------

export type DataSource = "live" | "demo" | "unknown";

let source: DataSource = DEMO_MODE ? "demo" : "unknown";
let probe: Promise<DataSource> | null = null;
const listeners = new Set<(s: DataSource) => void>();

function setSource(next: DataSource) {
  source = next;
  listeners.forEach((fn) => fn(next));
}

export function getDataSource(): DataSource {
  return source;
}

export function onDataSourceChange(fn: (s: DataSource) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function resolveSource(): Promise<DataSource> {
  if (source !== "unknown") return source;
  if (!probe) {
    probe = probeBackend().then((ok) => {
      setSource(ok ? "live" : "demo");
      return source;
    });
  }
  return probe;
}

// GET /health with a short timeout. Any failure (connection refused, dev-server
// proxy error, timeout) means "no backend available".
async function probeBackend(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Re-probe the backend (e.g. after the user starts it).
export function resetDataSource() {
  if (DEMO_MODE) return;
  probe = null;
  setSource("unknown");
}

function pick<K extends keyof MeetOpsApi>(name: K): MeetOpsApi[K] {
  return (async (...args: unknown[]) => {
    const s = await resolveSource();
    const impl = (s === "demo" ? demoApi : liveApi)[name] as (...a: unknown[]) => unknown;
    return impl(...args);
  }) as unknown as MeetOpsApi[K];
}

export const api: MeetOpsApi = {
  health: pick("health"),
  listMeetings: pick("listMeetings"),
  getMeeting: pick("getMeeting"),
  getSegments: pick("getSegments"),
  uploadMeeting: pick("uploadMeeting"),
  deleteMeeting: pick("deleteMeeting"),
  listTasks: pick("listTasks"),
  updateTask: pick("updateTask"),
  listDecisions: pick("listDecisions"),
  listRisks: pick("listRisks"),
  listUsers: pick("listUsers"),
  insights: pick("insights"),
  search: pick("search"),
  listNotifications: pick("listNotifications"),
  markNotificationsRead: pick("markNotificationsRead"),
};
