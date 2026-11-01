// Shared domain types for the MeetOps frontend.
// They mirror the JSON returned by the FastAPI backend (camelCase keys, see backend/app/schemas.py).

export type Category = "Task" | "Decision" | "Risk" | "Other";
export type TaskStatus = "Open" | "In Progress" | "Completed";
export type Priority = "Low" | "Medium" | "High";
export type RiskSeverity = "Low" | "Medium" | "High";
export type RiskStatus = "Open" | "Mitigated" | "Closed";
export type MeetingSource = "audio" | "video" | "transcript";
export type MeetingStatus = "Queued" | "Processing" | "Processed" | "Failed";
export type PipelineStage = "upload" | "transcribe" | "preprocess" | "classify" | "extract" | "save";
export type Role = "admin" | "manager" | "member";
export type ReviewStatus = "suggested" | "confirmed" | "rejected";
export type ItemSource = "ai" | "manual";

export interface DepartmentRef {
  id: number;
  name: string;
}

export interface Department extends DepartmentRef {
  memberCount: number;
}

export interface User {
  id: number;
  name: string;
  initials: string;
  email: string;
  role: Role;
  title: string | null;
  department: DepartmentRef | null;
  isActive: boolean;
}

export interface Meeting {
  id: number;
  title: string;
  date: string;
  durationMin: number | null;
  source: MeetingSource;
  status: MeetingStatus;
  pipelineStage: PipelineStage | null;
  errorMessage: string | null;
  participants: User[];
  department: DepartmentRef | null;
  uploadedBy: User | null;
  taskCount: number;
  decisionCount: number;
  riskCount: number;
  suggestedCount: number;
  summary: string | null;
  modelName: string | null;
  createdAt: string;
}

// Links an extracted record back to the transcript line it came from.
export interface EvidenceRef {
  segmentId: number;
  speaker: string | null;
  timestamp: string | null;
  quote: string;
}

interface Reviewable {
  reviewStatus: ReviewStatus;
  confidence: number | null;
  source: ItemSource;
  evidence: EvidenceRef | null;
}

export interface Task extends Reviewable {
  id: number;
  description: string;
  owner: User | null;
  ownerName: string | null; // the owner's name as heard in the meeting (also set when they have no account)
  meetingId: number;
  meetingTitle: string;
  meetingDate: string;
  department: DepartmentRef | null;
  deadline: string | null;
  deadlineText: string | null;
  status: TaskStatus;
  priority: Priority;
  createdAt: string;
  completedAt: string | null;
}

export interface Decision extends Reviewable {
  id: number;
  statement: string;
  owner: User | null;
  ownerName: string | null;
  meetingId: number;
  meetingTitle: string;
  department: DepartmentRef | null;
  decidedAt: string;
}

export interface Risk extends Reviewable {
  id: number;
  description: string;
  meetingId: number;
  meetingTitle: string;
  department: DepartmentRef | null;
  severity: RiskSeverity;
  status: RiskStatus;
  owner: User | null;
  raisedBy: string | null;
  raisedAt: string;
  recurring: boolean;
}

export interface TranscriptSegment {
  id: number;
  speaker: string | null;
  timestamp: string | null;
  startSec: number | null;
  text: string;
  category: Category;
  confidence: number | null;
  modelLabel: Category | null;
  rule: string | null;
  corrected: boolean;
}

export interface ReviewQueue {
  tasks: Task[];
  decisions: Decision[];
  risks: Risk[];
}

export interface NameValue {
  name: string;
  value: number;
}

export interface InsightsSummary {
  totals: {
    meetings: number;
    processedMeetings: number;
    processingMeetings: number;
    tasks: number;
    openTasks: number;
    overdueTasks: number;
    dueThisWeek: number;
    decisions: number;
    risks: number;
    openRisks: number;
    highRisks: number;
    pendingReview: number;
  };
  me: {
    openTasks: number;
    overdueTasks: number;
    dueThisWeek: number;
    completedThisWeek: number;
    pendingReview: number;
  };
  taskStatus: NameValue[];
  riskSeverity: NameValue[];
  itemsPerMeeting: { id: number; name: string; tasks: number; decisions: number; risks: number }[];
  workload: { userId: number; name: string; open: number; inProgress: number; completed: number; overdue: number }[];
  departments: { name: string; openTasks: number; overdueTasks: number; completionRate: number }[];
  weekly: { week: string; created: number; completed: number }[];
  recurringRisks: Risk[];
  completionRate: number;
  onTimeRate: number | null;
  avgItemsPerMeeting: number;
  reviewAcceptanceRate: number | null;
  topOwner: string | null;
}

export interface Activity {
  id: number;
  actor: User | null;
  entity: string;
  entityId: number;
  action: string;
  detail: string | null;
  meetingId: number | null;
  createdAt: string;
}

export type NotificationType = "overdue" | "due_soon" | "assigned" | "status_change" | "review";

export interface Notification {
  id: number;
  type: NotificationType;
  message: string;
  taskId: number | null;
  meetingId: number | null;
  read: boolean;
  createdAt: string;
}

export interface SearchResults {
  query: string;
  meetings: Meeting[];
  tasks: Task[];
  decisions: Decision[];
  risks: Risk[];
}

export interface AuthResponse {
  token: string;
  user: User;
}
