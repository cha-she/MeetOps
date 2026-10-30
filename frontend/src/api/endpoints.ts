import { http } from "./client";
import type {
  Activity,
  AuthResponse,
  Category,
  Decision,
  Department,
  InsightsSummary,
  Meeting,
  Notification,
  Priority,
  ReviewQueue,
  ReviewStatus,
  Risk,
  RiskSeverity,
  RiskStatus,
  Role,
  SearchResults,
  Task,
  TaskStatus,
  TranscriptSegment,
  User,
} from "../types";

// One function per API endpoint; pages never call fetch directly.

export interface TaskFilters {
  status?: TaskStatus | "";
  meetingId?: number;
  ownerId?: number;
  departmentId?: number;
  mine?: boolean;
  unassigned?: boolean;
  review?: ReviewStatus | "";
  priority?: Priority | "";
  q?: string;
  overdue?: boolean;
  dueFrom?: string;
  dueTo?: string;
  from?: string;
  to?: string;
  sort?: "deadline" | "created" | "priority";
  limit?: number;
}

export interface DecisionFilters {
  meetingId?: number;
  ownerId?: number;
  departmentId?: number;
  review?: ReviewStatus | "";
  from?: string;
  to?: string;
  q?: string;
}

export interface RiskFilters extends DecisionFilters {
  severity?: RiskSeverity | "";
  status?: RiskStatus | "";
  recurring?: boolean;
}

export interface MeetingFilters {
  q?: string;
  departmentId?: number;
  participantId?: number;
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export type TaskPatch = Partial<Pick<Task, "status" | "deadline" | "description" | "priority" | "reviewStatus">> & {
  ownerId?: number | null;
};

export const api = {
  health: () => http.get<{ status: string; version: string; database: string; model: string | null; rules: boolean }>("/health"),

  // Auth
  authStatus: () => http.get<{ needsSetup: boolean }>("/auth/status"),
  setup: (body: { name: string; email: string; password: string; department: string; title?: string }) =>
    http.post<AuthResponse>("/auth/setup", body),
  login: (email: string, password: string) => http.post<AuthResponse>("/auth/login", { email, password }),
  me: () => http.get<User>("/auth/me"),

  // Meetings
  listMeetings: (params?: MeetingFilters) => http.get<Meeting[]>("/meetings", { ...params }),
  getMeeting: (id: number | string) => http.get<Meeting>(`/meetings/${id}`),
  getSegments: (id: number | string) => http.get<TranscriptSegment[]>(`/meetings/${id}/segments`),
  uploadMeeting: (formData: FormData) => http.upload<Meeting>("/meetings/upload", formData),
  deleteMeeting: (id: number) => http.del<void>(`/meetings/${id}`),
  reclassifySegment: (segmentId: number, category: Category) =>
    http.post<TranscriptSegment>(`/segments/${segmentId}/category`, { category }),

  // Registers
  listTasks: (params?: TaskFilters) => http.get<Task[]>("/tasks", { ...params }),
  createTask: (body: { description: string; meetingId: number; ownerId?: number | null; deadline?: string | null; priority?: Priority; segmentId?: number }) =>
    http.post<Task>("/tasks", body),
  updateTask: (id: number, patch: TaskPatch) => http.patch<Task>(`/tasks/${id}`, patch),
  listDecisions: (params?: DecisionFilters) => http.get<Decision[]>("/decisions", { ...params }),
  updateDecision: (id: number, patch: { statement?: string; ownerId?: number | null; reviewStatus?: ReviewStatus }) =>
    http.patch<Decision>(`/decisions/${id}`, patch),
  listRisks: (params?: RiskFilters) => http.get<Risk[]>("/risks", { ...params }),
  updateRisk: (
    id: number,
    patch: { description?: string; severity?: RiskSeverity; status?: RiskStatus; ownerId?: number | null; reviewStatus?: ReviewStatus }
  ) => http.patch<Risk>(`/risks/${id}`, patch),
  reviewQueue: (params?: { meetingId?: number; mine?: boolean }) => http.get<ReviewQueue>("/review", { ...params }),

  // People
  listUsers: (includeInactive = false) => http.get<User[]>("/users", { includeInactive }),
  createUser: (body: { name: string; email: string; password: string; role: Role; title?: string; departmentId?: number | null }) =>
    http.post<User>("/users", body),
  updateUser: (
    id: number,
    patch: { name?: string; role?: Role; title?: string | null; departmentId?: number | null; isActive?: boolean; password?: string }
  ) => http.patch<User>(`/users/${id}`, patch),
  listDepartments: () => http.get<Department[]>("/departments"),
  createDepartment: (name: string) => http.post<Department>("/departments", { name }),
  renameDepartment: (id: number, name: string) => http.patch<Department>(`/departments/${id}`, { name }),
  deleteDepartment: (id: number) => http.del<void>(`/departments/${id}`),

  // Insights, activity, search, notifications
  insights: () => http.get<InsightsSummary>("/insights/summary"),
  activity: (params?: { meetingId?: number; limit?: number }) => http.get<Activity[]>("/activity", { ...params }),
  search: (q: string) => http.get<SearchResults>("/search", { q }),
  listNotifications: () => http.get<Notification[]>("/notifications"),
  markNotificationsRead: () => http.post<void>("/notifications/read-all"),
};
