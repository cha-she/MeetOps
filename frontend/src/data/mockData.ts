import type {
  Decision,
  Meeting,
  Person,
  Risk,
  Task,
  TranscriptSegment,
} from "../types";

// ---------------------------------------------------------------------------
// Mock data for the MeetOps demo.
// Replace these arrays with real API calls (FastAPI backend) once available.
// ---------------------------------------------------------------------------

export const people: Person[] = [
  { id: "p1", name: "Chamodi Shehani", initials: "CS", role: "Project Lead" },
  { id: "p2", name: "Ravindu Perera", initials: "RP", role: "Backend Engineer" },
  { id: "p3", name: "Nethmi Fernando", initials: "NF", role: "ML Engineer" },
  { id: "p4", name: "Kasun Silva", initials: "KS", role: "Frontend Engineer" },
  { id: "p5", name: "Ishara Jayasuriya", initials: "IJ", role: "QA / PMO" },
  { id: "p6", name: "Dilini Wickrama", initials: "DW", role: "Product Manager" },
];

export const personById = (id: string) =>
  people.find((p) => p.id === id) ?? {
    id,
    name: "Unassigned",
    initials: "—",
    role: "",
  };

export const meetings: Meeting[] = [
  {
    id: "m1",
    title: "Sprint 7 Planning",
    date: "2026-06-29",
    durationMin: 52,
    source: "video",
    status: "Processed",
    participants: ["p1", "p2", "p3", "p4", "p5"],
    taskCount: 6,
    decisionCount: 3,
    riskCount: 2,
    summary:
      "Scoped Sprint 7 around the classification model and the task tracker UI. Agreed to freeze the segment schema and prioritise the AMI subset annotation. Two risks flagged around annotation throughput and ASR accuracy on overlapping speech.",
  },
  {
    id: "m2",
    title: "Client Review — Northwind SME",
    date: "2026-06-26",
    durationMin: 41,
    source: "audio",
    status: "Processed",
    participants: ["p1", "p6", "p2"],
    taskCount: 4,
    decisionCount: 2,
    riskCount: 1,
    summary:
      "Walked Northwind through the decision register and risk log. Client requested export to PDF and a weekly digest email. Approved the RBAC roles for their PMO team.",
  },
  {
    id: "m3",
    title: "ML Model Sync",
    date: "2026-06-24",
    durationMin: 34,
    source: "transcript",
    status: "Processed",
    participants: ["p3", "p1", "p2"],
    taskCount: 5,
    decisionCount: 2,
    riskCount: 3,
    summary:
      "Reviewed baseline results: TF-IDF + Linear SVM at 0.81 macro-F1 on the labelled subset. Decided to trial DistilBERT fine-tuning. Risks around class imbalance for the Risk category and limited labelled data.",
  },
  {
    id: "m4",
    title: "Ops Review — Week 26",
    date: "2026-06-22",
    durationMin: 28,
    source: "video",
    status: "Processed",
    participants: ["p1", "p5", "p6", "p4"],
    taskCount: 3,
    decisionCount: 1,
    riskCount: 1,
    summary:
      "Reviewed overdue tasks from Sprint 6 and reassigned two items. Decided to move the demo environment to a shared staging server.",
  },
  {
    id: "m5",
    title: "Sprint 8 Planning",
    date: "2026-07-01",
    durationMin: 47,
    source: "video",
    status: "Processing",
    participants: ["p1", "p2", "p3", "p4", "p5", "p6"],
    taskCount: 0,
    decisionCount: 0,
    riskCount: 0,
    summary: "Transcription and analysis in progress…",
  },
];

export const meetingById = (id: string) => meetings.find((m) => m.id === id);

export const tasks: Task[] = [
  {
    id: "t1",
    description: "Freeze the transcript segment schema and document the fields",
    ownerId: "p2",
    meetingId: "m1",
    deadline: "2026-07-03",
    status: "In Progress",
    createdAt: "2026-06-29",
    evidence: {
      speaker: "Chamodi",
      timestamp: "00:08:12",
      quote:
        "Ravindu, can you lock the segment schema this week so the ML side isn't shifting under us?",
    },
  },
  {
    id: "t2",
    description: "Annotate the first 500 AMI segments in Label Studio",
    ownerId: "p3",
    meetingId: "m1",
    deadline: "2026-07-06",
    status: "In Progress",
    createdAt: "2026-06-29",
    evidence: {
      speaker: "Nethmi",
      timestamp: "00:21:40",
      quote:
        "I'll take the first batch of annotations, target five hundred segments by the weekend.",
    },
  },
  {
    id: "t3",
    description: "Build the Task Tracker table with status and deadline columns",
    ownerId: "p4",
    meetingId: "m1",
    deadline: "2026-07-04",
    status: "Completed",
    createdAt: "2026-06-29",
    evidence: {
      speaker: "Kasun",
      timestamp: "00:33:05",
      quote: "I can have the task tracker table done before the next standup.",
    },
  },
  {
    id: "t4",
    description: "Add PDF export for the decision register",
    ownerId: "p4",
    meetingId: "m2",
    deadline: "2026-07-08",
    status: "Open",
    createdAt: "2026-06-26",
    evidence: {
      speaker: "Dilini",
      timestamp: "00:15:22",
      quote: "The client explicitly asked for PDF export of the decision register.",
    },
  },
  {
    id: "t5",
    description: "Implement weekly digest email for task owners",
    ownerId: "p2",
    meetingId: "m2",
    deadline: "2026-07-11",
    status: "Open",
    createdAt: "2026-06-26",
    evidence: {
      speaker: "Dilini",
      timestamp: "00:19:03",
      quote: "They'd love a weekly digest so nothing slips through the cracks.",
    },
  },
  {
    id: "t6",
    description: "Set up DistilBERT fine-tuning experiment on the labelled subset",
    ownerId: "p3",
    meetingId: "m3",
    deadline: "2026-06-30",
    status: "Open",
    createdAt: "2026-06-24",
    evidence: {
      speaker: "Nethmi",
      timestamp: "00:11:47",
      quote: "Let's spin up a DistilBERT run and compare it against the SVM baseline.",
    },
  },
  {
    id: "t7",
    description: "Fix overlapping-speech handling in the ASR preprocessing step",
    ownerId: "p2",
    meetingId: "m3",
    deadline: "2026-06-28",
    status: "In Progress",
    createdAt: "2026-06-24",
    evidence: {
      speaker: "Ravindu",
      timestamp: "00:24:18",
      quote: "The transcripts get messy when two people talk over each other.",
    },
  },
  {
    id: "t8",
    description: "Reassign Sprint 6 overdue items and update the board",
    ownerId: "p5",
    meetingId: "m4",
    deadline: "2026-06-25",
    status: "Completed",
    createdAt: "2026-06-22",
    evidence: {
      speaker: "Ishara",
      timestamp: "00:06:55",
      quote: "I'll clean up the board and reassign the two overdue tasks today.",
    },
  },
  {
    id: "t9",
    description: "Migrate the demo environment to the shared staging server",
    ownerId: "p4",
    meetingId: "m4",
    deadline: "2026-07-02",
    status: "In Progress",
    createdAt: "2026-06-22",
    evidence: {
      speaker: "Chamodi",
      timestamp: "00:18:30",
      quote: "Let's get the demo onto staging so everyone can hit the same build.",
    },
  },
  {
    id: "t10",
    description: "Prepare mid-progress evaluation slide deck",
    ownerId: "p1",
    meetingId: "m4",
    deadline: "2026-07-04",
    status: "In Progress",
    createdAt: "2026-06-22",
    evidence: {
      speaker: "Dilini",
      timestamp: "00:23:11",
      quote: "We need the evaluation deck ready well before the review.",
    },
  },
  {
    id: "t11",
    description: "Balance the Risk class with additional labelled examples",
    ownerId: "p3",
    meetingId: "m3",
    deadline: "2026-07-05",
    status: "Open",
    createdAt: "2026-06-24",
    evidence: {
      speaker: "Nethmi",
      timestamp: "00:29:02",
      quote: "The Risk class is starved — we need more labelled risk examples.",
    },
  },
];

export const decisions: Decision[] = [
  {
    id: "d1",
    statement:
      "Freeze the segment schema after Sprint 7; no further field changes without sign-off.",
    ownerId: "p1",
    meetingId: "m1",
    decidedAt: "2026-06-29",
    evidence: {
      speaker: "Chamodi",
      timestamp: "00:09:40",
      quote: "Decision: we freeze the schema at the end of this sprint.",
    },
  },
  {
    id: "d2",
    statement: "Prioritise annotating the AMI subset over collecting new recordings.",
    ownerId: "p3",
    meetingId: "m1",
    decidedAt: "2026-06-29",
    evidence: {
      speaker: "Nethmi",
      timestamp: "00:22:15",
      quote: "We'll focus on annotating AMI first rather than gathering more data.",
    },
  },
  {
    id: "d3",
    statement: "Adopt macro-F1 as the primary classification metric for evaluation.",
    ownerId: "p3",
    meetingId: "m1",
    decidedAt: "2026-06-29",
    evidence: {
      speaker: "Nethmi",
      timestamp: "00:41:08",
      quote: "Given the class imbalance, macro-F1 is the metric we report on.",
    },
  },
  {
    id: "d4",
    statement: "Approve the RBAC role set (Admin, Manager, Lead, Staff, Viewer) for the client.",
    ownerId: "p1",
    meetingId: "m2",
    decidedAt: "2026-06-26",
    evidence: {
      speaker: "Chamodi",
      timestamp: "00:27:44",
      quote: "Approved — five roles, with HR and finance on the restricted viewer tier.",
    },
  },
  {
    id: "d5",
    statement: "Ship PDF export and weekly digest before the client pilot.",
    ownerId: "p6",
    meetingId: "m2",
    decidedAt: "2026-06-26",
    evidence: {
      speaker: "Dilini",
      timestamp: "00:31:10",
      quote: "Both of those are must-haves for the pilot, let's commit to them.",
    },
  },
  {
    id: "d6",
    statement: "Trial DistilBERT fine-tuning; keep SVM as the fallback baseline.",
    ownerId: "p3",
    meetingId: "m3",
    decidedAt: "2026-06-24",
    evidence: {
      speaker: "Nethmi",
      timestamp: "00:13:20",
      quote: "We try DistilBERT, but the SVM stays as our safety net.",
    },
  },
  {
    id: "d7",
    statement: "Move the demo environment to the shared staging server.",
    ownerId: "p1",
    meetingId: "m4",
    decidedAt: "2026-06-22",
    evidence: {
      speaker: "Chamodi",
      timestamp: "00:19:02",
      quote: "Agreed, staging becomes the single demo environment.",
    },
  },
];

export const risks: Risk[] = [
  {
    id: "r1",
    description:
      "Annotation throughput may not keep pace with the model training schedule.",
    meetingId: "m1",
    severity: "High",
    raisedAt: "2026-06-29",
    recurring: true,
    evidence: {
      speaker: "Nethmi",
      timestamp: "00:24:50",
      quote: "If annotation slips, the whole training timeline slips with it.",
    },
  },
  {
    id: "r2",
    description: "ASR accuracy drops on overlapping / cross-talk speech segments.",
    meetingId: "m1",
    severity: "Medium",
    raisedAt: "2026-06-29",
    recurring: true,
    evidence: {
      speaker: "Ravindu",
      timestamp: "00:37:12",
      quote: "Cross-talk is where Whisper starts making things up.",
    },
  },
  {
    id: "r3",
    description: "Class imbalance for the Risk category could bias the classifier.",
    meetingId: "m3",
    severity: "High",
    raisedAt: "2026-06-24",
    recurring: false,
    evidence: {
      speaker: "Nethmi",
      timestamp: "00:28:40",
      quote: "We have far fewer Risk examples than Tasks, that'll hurt recall.",
    },
  },
  {
    id: "r4",
    description: "Limited labelled data may cap achievable model accuracy.",
    meetingId: "m3",
    severity: "Medium",
    raisedAt: "2026-06-24",
    recurring: false,
    evidence: {
      speaker: "Ravindu",
      timestamp: "00:31:55",
      quote: "Three thousand segments is thin for a transformer.",
    },
  },
  {
    id: "r5",
    description: "Single dependency on the AMI corpus limits domain generalisation.",
    meetingId: "m3",
    severity: "Low",
    raisedAt: "2026-06-24",
    recurring: false,
    evidence: {
      speaker: "Nethmi",
      timestamp: "00:33:02",
      quote: "AMI is meetings, but not our client's exact domain.",
    },
  },
  {
    id: "r6",
    description: "Client pilot deadline is tight given the export features backlog.",
    meetingId: "m2",
    severity: "Medium",
    raisedAt: "2026-06-26",
    recurring: false,
    evidence: {
      speaker: "Dilini",
      timestamp: "00:34:18",
      quote: "The pilot date is fixed, and we still owe them exports.",
    },
  },
  {
    id: "r7",
    description: "Staging migration may cause demo downtime during the review week.",
    meetingId: "m4",
    severity: "Low",
    raisedAt: "2026-06-22",
    recurring: false,
    evidence: {
      speaker: "Ishara",
      timestamp: "00:21:40",
      quote: "Let's not migrate the day before the demo.",
    },
  },
];

// A classified transcript for meeting m1 — demonstrates the classification output
// (Task / Decision / Risk / Other) with per-segment confidence.
export const transcriptByMeeting: Record<string, TranscriptSegment[]> = {
  m1: [
    {
      id: "s1",
      speaker: "Chamodi",
      timestamp: "00:07:55",
      text: "Okay, let's talk scope for Sprint 7. Two big things: the classifier and the task tracker UI.",
      category: "Other",
      confidence: 0.72,
    },
    {
      id: "s2",
      speaker: "Chamodi",
      timestamp: "00:08:12",
      text: "Ravindu, can you lock the segment schema this week so the ML side isn't shifting under us?",
      category: "Task",
      confidence: 0.93,
    },
    {
      id: "s3",
      speaker: "Chamodi",
      timestamp: "00:09:40",
      text: "Decision: we freeze the schema at the end of this sprint.",
      category: "Decision",
      confidence: 0.96,
    },
    {
      id: "s4",
      speaker: "Nethmi",
      timestamp: "00:21:40",
      text: "I'll take the first batch of annotations, target five hundred segments by the weekend.",
      category: "Task",
      confidence: 0.91,
    },
    {
      id: "s5",
      speaker: "Nethmi",
      timestamp: "00:22:15",
      text: "We'll focus on annotating AMI first rather than gathering more data.",
      category: "Decision",
      confidence: 0.88,
    },
    {
      id: "s6",
      speaker: "Nethmi",
      timestamp: "00:24:50",
      text: "If annotation slips, the whole training timeline slips with it.",
      category: "Risk",
      confidence: 0.9,
    },
    {
      id: "s7",
      speaker: "Kasun",
      timestamp: "00:33:05",
      text: "I can have the task tracker table done before the next standup.",
      category: "Task",
      confidence: 0.89,
    },
    {
      id: "s8",
      speaker: "Ravindu",
      timestamp: "00:37:12",
      text: "Cross-talk is where Whisper starts making things up.",
      category: "Risk",
      confidence: 0.84,
    },
    {
      id: "s9",
      speaker: "Nethmi",
      timestamp: "00:41:08",
      text: "Given the class imbalance, macro-F1 is the metric we report on.",
      category: "Decision",
      confidence: 0.87,
    },
    {
      id: "s10",
      speaker: "Chamodi",
      timestamp: "00:45:20",
      text: "Great, thanks everyone. Same time next week.",
      category: "Other",
      confidence: 0.79,
    },
  ],
};
