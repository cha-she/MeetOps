// Shared domain types for MeetOps.
// These mirror the structured records the backend/ML pipeline will eventually produce
// (see the proposal: Tasks, Decisions, Risks extracted from meeting transcripts).

export type Category = "Task" | "Decision" | "Risk" | "Other";

export type TaskStatus = "Open" | "In Progress" | "Completed";

export type RiskSeverity = "Low" | "Medium" | "High";

export type MeetingSource = "audio" | "video" | "transcript";

export type MeetingStatus = "Processing" | "Processed" | "Failed";

export interface Person {
  id: string;
  name: string;
  initials: string;
  role: string;
}

export interface Meeting {
  id: string;
  title: string;
  date: string; // ISO date
  durationMin: number;
  source: MeetingSource;
  status: MeetingStatus;
  participants: string[]; // person ids
  taskCount: number;
  decisionCount: number;
  riskCount: number;
  summary: string;
}

export interface Task {
  id: string;
  description: string;
  ownerId: string;
  meetingId: string;
  deadline: string; // ISO date
  status: TaskStatus;
  createdAt: string;
  // Evidence trace back to the source segment
  evidence: EvidenceRef;
}

export interface Decision {
  id: string;
  statement: string;
  ownerId: string;
  meetingId: string;
  decidedAt: string;
  evidence: EvidenceRef;
}

export interface Risk {
  id: string;
  description: string;
  meetingId: string;
  severity: RiskSeverity;
  raisedAt: string;
  recurring: boolean;
  evidence: EvidenceRef;
}

// Links an extracted record back to the original meeting segment (evidence traceability).
export interface EvidenceRef {
  speaker: string;
  timestamp: string; // e.g. "00:12:44"
  quote: string;
}

// A single classified utterance from a transcript.
export interface TranscriptSegment {
  id: string;
  speaker: string;
  timestamp: string;
  text: string;
  category: Category;
  confidence: number; // 0..1 model confidence
}
