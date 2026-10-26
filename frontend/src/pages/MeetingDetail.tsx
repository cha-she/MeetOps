import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Quote,
  ListChecks,
  Gavel,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { api } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  EvidenceBlock,
  ListSkeleton,
  QueryView,
  Skeleton,
  categoryStyles,
  formatDate,
  formatDuration,
  severityStyles,
  sourceLabel,
  statusStyles,
} from "../components/ui";
import type { Category } from "../types";

type Tab = "transcript" | "tasks" | "decisions" | "risks";

const categoryFilters: (Category | "All")[] = ["All", "Task", "Decision", "Risk", "Other"];

export default function MeetingDetail() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const highlightSegment = searchParams.get("segment");

  const [tab, setTab] = useState<Tab>("transcript");
  const [catFilter, setCatFilter] = useState<Category | "All">("All");

  const meeting = useQuery(`meeting:${id}`, () => api.getMeeting(id));
  const segments = useQuery(`segments:${id}`, () => api.getSegments(id));
  const tasks = useQuery(`tasks:m${id}`, () => api.listTasks({ meetingId: Number(id) }));
  const decisions = useQuery(`decisions:m${id}`, () => api.listDecisions({ meetingId: Number(id) }));
  const risks = useQuery(`risks:m${id}`, () => api.listRisks({ meetingId: Number(id) }));

  // Scroll to a highlighted segment when arriving from an evidence link.
  useEffect(() => {
    if (!highlightSegment || !segments.data) return;
    const el = document.getElementById(`segment-${highlightSegment}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightSegment, segments.data]);

  if (meeting.loading && !meeting.data) {
    return (
      <div>
        <Skeleton className="mb-4 h-4 w-32" />
        <div className="card p-6">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="mt-3 h-4 w-1/3" />
          <Skeleton className="mt-6 h-16 w-full" />
        </div>
      </div>
    );
  }

  if (meeting.error && !meeting.data) {
    if (meeting.error.status === 404) {
      return (
        <EmptyState
          title="Meeting not found"
          message="This meeting does not exist or was deleted."
          action={<Link to="/meetings" className="btn-ghost">Back to meetings</Link>}
        />
      );
    }
    return <ErrorState error={meeting.error} onRetry={meeting.reload} />;
  }

  const m = meeting.data!;
  const processing = m.status === "Queued" || m.status === "Processing";

  const tabs: { key: Tab; label: string; count?: number; icon: typeof ListChecks }[] = [
    { key: "transcript", label: "Transcript", count: segments.data?.length, icon: Quote },
    { key: "tasks", label: "Tasks", count: tasks.data?.length, icon: ListChecks },
    { key: "decisions", label: "Decisions", count: decisions.data?.length, icon: Gavel },
    { key: "risks", label: "Risks", count: risks.data?.length, icon: ShieldAlert },
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
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{m.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {formatDate(m.date)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {formatDuration(m.durationMin)}
              </span>
              <span>{sourceLabel[m.source]} source</span>
              {processing && (
                <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
                  <Loader2 className="h-3 w-3 animate-spin" /> Processing
                </Badge>
              )}
              {m.status === "Failed" && (
                <Badge className="bg-red-50 text-red-700 ring-red-200">Failed</Badge>
              )}
            </div>
          </div>
          <div className="flex -space-x-2">
            {m.participants.map((p) => (
              <Avatar key={p.id} initials={p.initials} title={p.name} className="ring-2 ring-white" />
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-slate-50 p-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Summary
          </div>
          {m.summary ? (
            <p className="text-sm leading-relaxed text-slate-600">{m.summary}</p>
          ) : (
            <p className="text-sm italic text-slate-400">
              {processing
                ? "The summary will appear once processing finishes."
                : "No summary available for this meeting."}
            </p>
          )}
        </div>
        {m.status === "Failed" && m.errorMessage && (
          <div className="mt-3 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            {m.errorMessage}
          </div>
        )}
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
                {t.count ?? "–"}
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
            <QueryView
              {...segments}
              onRetry={segments.reload}
              skeleton={<ListSkeleton rows={5} />}
              isEmpty={(d) => d.length === 0}
              empty={
                <EmptyState
                  title="No transcript segments"
                  message={
                    processing
                      ? "Segments appear here as soon as the transcript has been processed."
                      : "This meeting has no transcript segments."
                  }
                />
              }
            >
              {(all) => {
                const shown = catFilter === "All" ? all : all.filter((s) => s.category === catFilter);
                if (shown.length === 0) {
                  return <EmptyState title="No segments" message={`No segments were classified as ${catFilter}.`} />;
                }
                return (
                  <div className="space-y-3">
                    {shown.map((s) => {
                      const highlighted = String(s.id) === highlightSegment;
                      return (
                        <div
                          id={`segment-${s.id}`}
                          key={s.id}
                          className={`card flex gap-4 p-4 ${highlighted ? "ring-2 ring-brand-400" : ""}`}
                        >
                          <div className="w-24 shrink-0 text-right">
                            <div className="truncate text-sm font-semibold text-slate-700">
                              {s.speaker ?? "Speaker"}
                            </div>
                            <div className="font-mono text-xs text-slate-400">{s.timestamp ?? ""}</div>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-slate-700">{s.text}</p>
                            <div className="mt-2 flex items-center gap-2">
                              <Badge className={categoryStyles[s.category]}>{s.category}</Badge>
                              {s.confidence !== null && (
                                <span className="text-xs text-slate-400">
                                  {(s.confidence * 100).toFixed(0)}% confidence
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }}
            </QueryView>
          </>
        )}

        {tab === "tasks" && (
          <QueryView
            {...tasks}
            onRetry={tasks.reload}
            isEmpty={(d) => d.length === 0}
            empty={<EmptyState title="No tasks" message="No tasks were extracted from this meeting." />}
          >
            {(list) => (
              <div className="space-y-3">
                {list.map((t) => (
                  <div key={t.id} className="card p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="font-medium text-slate-800">{t.description}</div>
                      <Badge className={statusStyles[t.status]}>{t.status}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <Avatar initials={t.owner?.initials ?? "?"} className="h-5 w-5 text-[10px]" />
                        {t.owner?.name ?? "Unassigned"}
                      </span>
                      <span>Due {formatDate(t.deadline)}</span>
                    </div>
                    <EvidenceBlock evidence={t.evidence} />
                  </div>
                ))}
              </div>
            )}
          </QueryView>
        )}

        {tab === "decisions" && (
          <QueryView
            {...decisions}
            onRetry={decisions.reload}
            isEmpty={(d) => d.length === 0}
            empty={<EmptyState title="No decisions" message="No decisions were extracted from this meeting." />}
          >
            {(list) => (
              <div className="space-y-3">
                {list.map((d) => (
                  <div key={d.id} className="card p-4">
                    <div className="font-medium text-slate-800">{d.statement}</div>
                    <div className="mt-2 text-sm text-slate-500">
                      {d.owner ? `Decided by ${d.owner.name}` : "Decision owner not identified"} ·{" "}
                      {formatDate(d.decidedAt)}
                    </div>
                    <EvidenceBlock evidence={d.evidence} tone="emerald" />
                  </div>
                ))}
              </div>
            )}
          </QueryView>
        )}

        {tab === "risks" && (
          <QueryView
            {...risks}
            onRetry={risks.reload}
            isEmpty={(d) => d.length === 0}
            empty={<EmptyState title="No risks" message="No risks were raised in this meeting." />}
          >
            {(list) => (
              <div className="space-y-3">
                {list.map((r) => (
                  <div key={r.id} className="card p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="font-medium text-slate-800">{r.description}</div>
                      <Badge className={severityStyles[r.severity]}>{r.severity}</Badge>
                    </div>
                    <EvidenceBlock evidence={r.evidence} tone="amber" />
                  </div>
                ))}
              </div>
            )}
          </QueryView>
        )}
      </div>
    </div>
  );
}
