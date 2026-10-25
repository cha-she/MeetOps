import type { ReactNode } from "react";
import type {
  Category,
  MeetingSource,
  RiskSeverity,
  TaskStatus,
} from "../types";

// ---------------------------------------------------------------------------
// Small shared presentational helpers used across pages.
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
  className = "",
}: {
  initials: string;
  className?: string;
}) {
  return (
    <span
      title={initials}
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

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="card flex items-center justify-center px-6 py-16 text-sm text-slate-400">
      {message}
    </div>
  );
}

export const sourceLabel: Record<MeetingSource, string> = {
  audio: "Audio",
  video: "Video",
  transcript: "Transcript",
};

export function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// "Today" is fixed for the demo so the overdue logic is deterministic.
export const TODAY = new Date("2026-07-02T00:00:00");

export function isOverdue(deadlineIso: string, status: string): boolean {
  if (status === "Completed") return false;
  const d = new Date(deadlineIso + "T00:00:00");
  return d.getTime() < TODAY.getTime();
}

export function daysUntil(deadlineIso: string): number {
  const d = new Date(deadlineIso + "T00:00:00");
  return Math.round((d.getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
}
