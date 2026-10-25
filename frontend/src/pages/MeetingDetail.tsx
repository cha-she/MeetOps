import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Quote,
  ListChecks,
  Gavel,
  ShieldAlert,
} from "lucide-react";
import {
  meetingById,
  transcriptByMeeting,
  tasks,
  decisions,
  risks,
  personById,
  people,
} from "../data/mockData";
import {
  Avatar,
  Badge,
  categoryStyles,
  statusStyles,
  severityStyles,
  formatDate,
  sourceLabel,
} from "../components/ui";
import type { Category } from "../types";

type Tab = "transcript" | "tasks" | "decisions" | "risks";

const categoryFilters: (Category | "All")[] = [
  "All",
  "Task",
  "Decision",
  "Risk",
  "Other",
];

export default function MeetingDetail() {
  const { id = "" } = useParams();
  const meeting = meetingById(id);
  const [tab, setTab] = useState<Tab>("transcript");
  const [catFilter, setCatFilter] = useState<Category | "All">("All");

  if (!meeting) {
    return (
      <div className="card p-10 text-center text-slate-500">
        Meeting not found.{" "}
        <Link to="/meetings" className="text-brand-600 hover:underline">
          Back to meetings
        </Link>
      </div>
    );
  }

  const segments = transcriptByMeeting[meeting.id] ?? [];
  const shownSegments =
    catFilter === "All"
      ? segments
      : segments.filter((s) => s.category === catFilter);

  const mTasks = tasks.filter((t) => t.meetingId === meeting.id);
  const mDecisions = decisions.filter((d) => d.meetingId === meeting.id);
  const mRisks = risks.filter((r) => r.meetingId === meeting.id);
  const participants = people.filter((p) => meeting.participants.includes(p.id));

  const tabs: { key: Tab; label: string; count: number; icon: typeof ListChecks }[] = [
    { key: "transcript", label: "Transcript", count: segments.length, icon: Quote },
    { key: "tasks", label: "Tasks", count: mTasks.length, icon: ListChecks },
    { key: "decisions", label: "Decisions", count: mDecisions.length, icon: Gavel },
    { key: "risks", label: "Risks", count: mRisks.length, icon: ShieldAlert },
  ];

  return (
    <div>
      <Link
        to="/meetings"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to meetings
      </Link>

      {/* Header */}
      <div className="card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {meeting.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {formatDate(meeting.date)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {meeting.durationMin} min
              </span>
              <span>{sourceLabel[meeting.source]} source</span>
            </div>
          </div>
          <div className="flex -space-x-2">
            {participants.map((p) => (
              <Avatar key={p.id} initials={p.initials} className="ring-2 ring-white" />
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-slate-50 p-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            AI Summary
          </div>
          <p className="text-sm leading-relaxed text-slate-600">
            {meeting.summary}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                active
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {tab === "transcript" && (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {categoryFilters.map((c) => (
                <button
                  key={c}
                  onClick={() => setCatFilter(c)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition ${
                    catFilter === c
                      ? "bg-brand-600 text-white ring-brand-600"
                      : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {shownSegments.map((s) => (
                <div key={s.id} className="card flex gap-4 p-4">
                  <div className="w-20 shrink-0 text-right">
                    <div className="text-sm font-semibold text-slate-700">
                      {s.speaker}
                    </div>
                    <div className="font-mono text-xs text-slate-400">
                      {s.timestamp}
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-700">{s.text}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge className={categoryStyles[s.category]}>
                        {s.category}
                      </Badge>
                      <span className="text-xs text-slate-400">
                        {(s.confidence * 100).toFixed(0)}% confidence
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "tasks" && (
          <div className="space-y-3">
            {mTasks.map((t) => {
              const owner = personById(t.ownerId);
              return (
                <div key={t.id} className="card p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="font-medium text-slate-800">
                      {t.description}
                    </div>
                    <Badge className={statusStyles[t.status]}>{t.status}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar initials={owner.initials} className="h-5 w-5 text-[10px]" />
                      {owner.name}
                    </span>
                    <span>Due {formatDate(t.deadline)}</span>
                  </div>
                  <EvidenceBlock {...t.evidence} />
                </div>
              );
            })}
          </div>
        )}

        {tab === "decisions" && (
          <div className="space-y-3">
            {mDecisions.map((d) => {
              const owner = personById(d.ownerId);
              return (
                <div key={d.id} className="card p-4">
                  <div className="font-medium text-slate-800">{d.statement}</div>
                  <div className="mt-2 text-sm text-slate-500">
                    Decided by {owner.name} · {formatDate(d.decidedAt)}
                  </div>
                  <EvidenceBlock {...d.evidence} />
                </div>
              );
            })}
          </div>
        )}

        {tab === "risks" && (
          <div className="space-y-3">
            {mRisks.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="font-medium text-slate-800">
                    {r.description}
                  </div>
                  <Badge className={severityStyles[r.severity]}>
                    {r.severity}
                  </Badge>
                </div>
                <EvidenceBlock {...r.evidence} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EvidenceBlock({
  speaker,
  timestamp,
  quote,
}: {
  speaker: string;
  timestamp: string;
  quote: string;
}) {
  return (
    <div className="mt-3 flex gap-2 rounded-lg border-l-2 border-brand-300 bg-brand-50/40 px-3 py-2">
      <Quote className="h-4 w-4 shrink-0 text-brand-400" />
      <div className="text-xs text-slate-500">
        <span className="italic">"{quote}"</span>
        <span className="ml-1 font-medium text-slate-400">
          — {speaker}, {timestamp}
        </span>
      </div>
    </div>
  );
}
