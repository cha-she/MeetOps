// Shared domain types for the MeetOps frontend.
// They mirror the JSON returned by the FastAPI backend (camelCase keys).

export type Category = "Task" | "Decision" | "Risk" | "Other";

export type TaskStatus = "Open" | "In Progress" | "Completed";

export type RiskSeverity = "Low" | "Medium" | "High";

export type MeetingSource = "audio" | "video" | "transcript";

export type MeetingStatus = "Queued" | "Processing" | "Processed" | "Failed";

// Stage keys reported by the backend while a meeting is being processed.
export type PipelineStage =
  | "upload"
  | "transcribe"
  | "preprocess"
  | "classify"
  | "extract"
  | "save";

export interface User {
  id: number;
  name: string;
  initials: string;
  role: string;
}

export interface Meeting {
  id: number;
  title: string;
  date: string; // ISO date (YYYY-MM-DD)
  durationMin: number | null;
  source: MeetingSource;
  status: MeetingStatus;
  pipelineStage: PipelineStage | null;
  errorMessage: string | null;
  participants: User[];
  taskCount: number;
  decisionCount: number;
  riskCount: number;
  summary: string | null;
  createdAt: string;
}

// Links an extracted record back to the transcript segment it came from.
export interface EvidenceRef {
  segmentId: number;
  speaker: string | null;
  timestamp: string | null; // "00:12:44"
  quote: string;
}

export interface Task {
  id: number;
  description: string;
  owner: User | null;
  meetingId: number;
  meetingTitle: string;
  deadline: string | null; // ISO date
  status: TaskStatus;
  createdAt: string;
  evidence: EvidenceRef;
}

export interface Decision {
  id: number;
  statement: string;
  owner: User | null;
  meetingId: number;
  meetingTitle: string;
  decidedAt: string;
  evidence: EvidenceRef;
}

export interface Risk {
  id: number;
  description: string;
  meetingId: number;
  meetingTitle: string;
  severity: RiskSeverity;
  raisedAt: string;
  recurring: boolean;
  evidence: EvidenceRef;
}

// A single classified utterance from a transcript.
export interface TranscriptSegment {
  id: number;
  speaker: string | null;
  timestamp: string | null;
  startSec: number | null;
  text: string;
  category: Category;
  confidence: number | null; // 0..1 model confidence
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
    decisions: number;
    risks: number;
    highRisks: number;
  };
  taskStatus: NameValue[];
  riskSeverity: NameValue[];
  itemsPerMeeting: { name: string; tasks: number; decisions: number; risks: number }[];
  workload: { name: string; open: number; inProgress: number; completed: number }[];
  recurringRisks: Risk[];
  completionRate: number; // 0..100
  avgItemsPerMeeting: number;
  topOwner: string | null;
}

export type NotificationType = "overdue" | "due_soon" | "assigned" | "status_change";

export interface Notification {
  id: number;
  type: NotificationType;
  message: string;
  taskId: number | null;
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
