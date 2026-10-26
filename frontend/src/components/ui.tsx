/* eslint-disable react-refresh/only-export-components -- shared helpers and components live together on purpose */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Inbox, Quote, RefreshCw, ServerOff } from "lucide-react";
import type {
  Category,
  EvidenceRef,
  MeetingSource,
  RiskSeverity,
  TaskStatus,
} from "../types";
import type { ApiError } from "../api/client";

// ---------------------------------------------------------------------------
// Shared presentational helpers used across pages.
// ---------------------------------------------------------------------------

export const categoryStyles: Record<Category, string> = {
  Task: "bg-blue-50 text-blue-700 ring-blue-200",
  Decision: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Risk: "bg-amber-50 text-amber-700 ring-amber-200",
  Other: "bg-slate-100 text-slate-600 ring-slate-200",
};

export const statusStyles: Record<TaskStatus, string> = {
  Open: "bg-slate-100 text-slate-600 ring-slate-200",
  "In Progress": "bg-blue-50 text-blue-700 ring-blue-200",
  Completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

export const severityStyles: Record<RiskSeverity, string> = {
  Low: "bg-slate-100 text-slate-600 ring-slate-200",
  Medium: "bg-amber-50 text-amber-700 ring-amber-200",
  High: "bg-red-50 text-red-700 ring-red-200",
};

export const sourceLabel: Record<MeetingSource, string> = {
  audio: "Audio",
  video: "Video",
  transcript: "Transcript",
};

export function Badge({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${className}`}
    >
      {children}
    </span>
  );
}

// Deterministic gradient per person so avatars feel distinct but cohesive.
const avatarGradients = [
  "from-indigo-500 to-violet-500",
  "from-sky-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-fuchsia-500 to-purple-500",
];

function gradientFor(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n + seed.charCodeAt(i)) % 997;
  return avatarGradients[n % avatarGradients.length];
}

export function Avatar({
  initials,
  title,
  className = "",
}: {
  initials: string;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title ?? initials}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white shadow-sm ${gradientFor(
        initials
      )} ${className}`}
    >
      {initials}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[1.7rem] font-extrabold tracking-tight text-slate-900">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading / empty / error states
// ---------------------------------------------------------------------------

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card p-5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-3 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Inbox className="h-6 w-6" />
      </div>
      <div className="font-semibold text-slate-700">{title}</div>
      <p className="mt-1 max-w-sm text-sm text-slate-400">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry?: () => void;
}) {
  const offline = error.isNetworkError;
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-14 text-center">
      <div
        className={`mb-3 flex h-12 w-12 items-center justify-center rounded-2xl ${
          offline ? "bg-amber-50 text-amber-500" : "bg-red-50 text-red-500"
        }`}
      >
        {offline ? <ServerOff className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
      </div>
      <div className="font-semibold text-slate-700">
        {offline ? "Backend not connected" : "Something went wrong"}
      </div>
      <p className="mt-1 max-w-md text-sm text-slate-400">{error.message}</p>
      {offline && (
        <p className="mt-2 max-w-md text-xs text-slate-400">
          Start the API server from the <code className="rounded bg-slate-100 px-1">backend</code>{" "}
          folder, then retry.
        </p>
      )}
      {onRetry && (
        <button className="btn-ghost mt-5" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      )}
    </div>
  );
}

// Renders loading / error / empty / content in one place so pages stay short.
export function QueryView<T>({
  loading,
  error,
  data,
  onRetry,
  isEmpty,
  empty,
  skeleton,
  children,
}: {
  loading: boolean;
  error: ApiError | null;
  data: T | undefined;
  onRetry?: () => void;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (loading && data === undefined) return <>{skeleton ?? <ListSkeleton />}</>;
  if (error && data === undefined) return <ErrorState error={error} onRetry={onRetry} />;
  if (data === undefined) return null;
  if (isEmpty?.(data)) return <>{empty}</>;
  return <>{children(data)}</>;
}

// ---------------------------------------------------------------------------
// Evidence quote (traceability back to the transcript)
// ---------------------------------------------------------------------------

export function EvidenceBlock({
  evidence,
  meetingId,
  tone = "brand",
}: {
  evidence: EvidenceRef;
  meetingId?: number;
  tone?: "brand" | "emerald" | "amber";
}) {
  const tones = {
    brand: "border-brand-300 bg-brand-50/40 text-brand-400",
    emerald: "border-emerald-300 bg-emerald-50/40 text-emerald-400",
    amber: "border-amber-300 bg-amber-50/40 text-amber-400",
  }[tone];
  const [border, bg, icon] = tones.split(" ");
  const inner = (
    <>
      <Quote className={`h-4 w-4 shrink-0 ${icon}`} />
      <div className="text-xs text-slate-500">
        <span className="italic">"{evidence.quote}"</span>
        <span className="ml-1 font-medium text-slate-400">
          — {evidence.speaker ?? "Unknown speaker"}
          {evidence.timestamp ? `, ${evidence.timestamp}` : ""}
        </span>
      </div>
    </>
  );
  const cls = `mt-3 flex gap-2 rounded-lg border-l-2 ${border} ${bg} px-3 py-2`;
  if (meetingId !== undefined) {
    return (
      <Link
        to={`/meetings/${meetingId}?segment=${evidence.segmentId}`}
        className={`${cls} transition hover:brightness-95`}
        title="Open in transcript"
      >
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  // Date-only strings are interpreted as local midnight to avoid timezone shifts.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T00:00:00") : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(iso: string | null | undefined): string {
  const d = parseIso(iso);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatLongDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysUntil(deadlineIso: string | null | undefined): number | null {
  const d = parseIso(deadlineIso);
  if (!d) return null;
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - startOfToday().getTime()) / 86_400_000);
}

export function isOverdue(deadlineIso: string | null | undefined, status: TaskStatus): boolean {
  if (status === "Completed") return false;
  const days = daysUntil(deadlineIso);
  return days !== null && days < 0;
}

export function dueLabel(deadlineIso: string | null | undefined, status: TaskStatus): string {
  const days = daysUntil(deadlineIso);
  if (days === null) return "No deadline";
  if (status === "Completed") return "Completed";
  if (days < 0) return `Overdue by ${Math.abs(days)}d`;
  if (days === 0) return "Due today";
  return `Due in ${days}d`;
}

export function formatDuration(min: number | null): string {
  if (min === null || min === undefined) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
