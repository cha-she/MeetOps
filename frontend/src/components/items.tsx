/* eslint-disable react-refresh/only-export-components -- shared domain widgets and their style maps */
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDashed,
  CircleDot,
  Quote,
  Sparkles,
  UserRound,
  Wand2,
  X,
} from "lucide-react";
import { api } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import type { Category, Priority, ReviewStatus, RiskSeverity, RiskStatus, TaskStatus, User, EvidenceRef } from "../types";
import { Avatar, Badge, Menu, cn, dueInfo, type Tone } from "./ui";

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

export const categoryTone: Record<Category, Tone> = { Task: "blue", Decision: "green", Risk: "amber", Other: "neutral" };
export const severityTone: Record<RiskSeverity, Tone> = { High: "red", Medium: "amber", Low: "neutral" };
export const riskStatusTone: Record<RiskStatus, Tone> = { Open: "red", Mitigated: "amber", Closed: "green" };

export function CategoryChip({ category, className = "" }: { category: Category; className?: string }) {
  return (
    <Badge tone={categoryTone[category]} className={className}>
      {category}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: RiskSeverity }) {
  return <Badge tone={severityTone[severity]}>{severity}</Badge>;
}

// ---------------------------------------------------------------------------
// Review state and model confidence
// ---------------------------------------------------------------------------

export function ConfidenceMeter({ value, source }: { value: number | null; source?: "ai" | "manual" }) {
  if (value === null)
    return source === "ai" ? (
      <span className="inline-flex items-center gap-1 text-2xs text-faint" title="Found by the rule layer (an explicit request, commitment, agreement or concern), not by the model's own score">
        <Wand2 className="h-3 w-3" /> Rule
      </span>
    ) : null;
  const pct = Math.round(value * 100);
  const tone = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs tabular-nums text-faint" title={`Model confidence ${pct}%`}>
      <span className="h-1 w-8 overflow-hidden rounded-full bg-subtle">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </span>
      {pct}%
    </span>
  );
}

export function ReviewBadge({ status, source }: { status: ReviewStatus; source?: "ai" | "manual" }) {
  if (status === "suggested")
    return (
      <Badge tone="amber" title="Extracted automatically and not yet confirmed by a person">
        <Sparkles className="h-3 w-3" /> Needs review
      </Badge>
    );
  if (status === "rejected") return <Badge tone="neutral">Rejected</Badge>;
  if (source === "manual") return <Badge tone="neutral" title="Added or corrected by a person">Manual</Badge>;
  return null;
}

// ---------------------------------------------------------------------------
// Reviewed / Needs review / All switch used by the three registers.
// "Reviewed" (the default) = confirmed by a person, or confident enough to be confirmed automatically.
// ---------------------------------------------------------------------------

export type ReviewView = "reviewed" | "needs" | "all";

export function reviewViewOf(param: string | null): ReviewView {
  return param === "needs" || param === "all" ? param : "reviewed";
}

export function filterByReview<T extends { reviewStatus: ReviewStatus }>(items: T[], view: ReviewView): T[] {
  if (view === "all") return items;
  return items.filter((i) => (view === "needs" ? i.reviewStatus === "suggested" : i.reviewStatus === "confirmed"));
}

export function ReviewSwitch<T extends { reviewStatus: ReviewStatus }>({ items, value, onChange }: { items: T[] | undefined; value: ReviewView; onChange: (v: ReviewView) => void }) {
  const list = items ?? [];
  const reviewed = list.filter((i) => i.reviewStatus === "confirmed").length;
  const needs = list.filter((i) => i.reviewStatus === "suggested").length;
  const opts: { value: ReviewView; label: string; count: number }[] = [
    { value: "reviewed", label: "Reviewed", count: reviewed },
    { value: "needs", label: "Needs review", count: needs },
    { value: "all", label: "All", count: list.length },
  ];
  return (
    <div className="inline-flex h-9 items-center rounded-lg border border-line bg-subtle p-0.5" role="tablist" aria-label="Review state">
      {opts.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-full items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition",
            value === o.value ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"
          )}
        >
          {o.value === "needs" && <Sparkles className="h-3.5 w-3.5 text-amber-500" />}
          {o.label}
          <span className={cn("rounded px-1.5 text-2xs tabular-nums", o.value === "needs" && o.count > 0 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "text-faint")}>{o.count}</span>
        </button>
      ))}
    </div>
  );
}

export function ReviewButtons({ onConfirm, onReject, busy = false, size = "md" }: { onConfirm: () => void; onReject: () => void; busy?: boolean; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-7 px-2 text-xs" : "";
  return (
    <div className="flex items-center gap-1">
      <button className={cn("btn-secondary text-emerald-700 dark:text-emerald-400", cls)} disabled={busy} onClick={onConfirm} title="Confirm: this is correct">
        <Check className="h-3.5 w-3.5" /> Confirm
      </button>
      <button className={cn("btn-ghost", cls)} disabled={busy} onClick={onReject} title="Reject: this is not a real item">
        <X className="h-3.5 w-3.5" /> Reject
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence: the transcript line an item was extracted from
// ---------------------------------------------------------------------------

export function EvidenceQuote({ evidence, meetingId, className = "" }: { evidence: EvidenceRef | null; meetingId: number; className?: string }) {
  if (!evidence) return null;
  return (
    <Link
      to={`/meetings/${meetingId}?segment=${evidence.segmentId}`}
      className={cn("group flex items-start gap-1.5 text-[12px] text-faint hover:text-muted", className)}
      title="Open the transcript at this line"
    >
      <Quote className="mt-0.5 h-3 w-3 shrink-0" />
      <span className="line-clamp-1">
        {evidence.speaker && <span className="font-medium text-muted">{evidence.speaker}: </span>}
        {evidence.quote}
        {evidence.timestamp && <span className="ml-1 font-mono text-2xs opacity-70 group-hover:opacity-100">{evidence.timestamp}</span>}
      </span>
    </Link>
  );
}

// Small timestamp chip: opens the meeting at the line the item was taken from, which is then
// scrolled to the centre, highlighted and briefly flashed.
export function EvidenceTime({ evidence, meetingId, prefix }: { evidence: EvidenceRef | null; meetingId: number; prefix?: string | null }) {
  if (!evidence) return null;
  return (
    <Link
      to={`/meetings/${meetingId}?segment=${evidence.segmentId}`}
      replace
      preventScrollReset
      className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-2xs text-faint transition hover:bg-accent-soft hover:text-accent-text"
      title="Show this line in the transcript"
    >
      <Quote className="h-3 w-3" />
      {prefix && `${prefix} · `}
      <span className="font-mono">{evidence.timestamp ?? "line"}</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Task status / priority pickers
// ---------------------------------------------------------------------------

export const statusMeta: Record<TaskStatus, { icon: JSX.Element; tone: Tone }> = {
  Open: { icon: <Circle className="h-3.5 w-3.5 text-faint" />, tone: "neutral" },
  "In Progress": { icon: <CircleDot className="h-3.5 w-3.5 text-blue-500" />, tone: "blue" },
  Completed: { icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />, tone: "green" },
};

export function StatusIcon({ status }: { status: TaskStatus }) {
  return statusMeta[status].icon;
}

export function StatusMenu({ value, onChange, disabled = false, compact = false }: { value: TaskStatus; onChange: (s: TaskStatus) => void; disabled?: boolean; compact?: boolean }) {
  if (disabled)
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted" title="Only the owner, their manager or an admin can change this">
        <StatusIcon status={value} /> {!compact && value}
      </span>
    );
  return (
    <Menu
      width={170}
      header="Status"
      trigger={() => (
        <button
          className={cn("inline-flex h-7 items-center gap-1.5 rounded-md text-[12px] hover:bg-hover hover:text-fg", compact ? "px-1.5 text-muted" : "border border-line bg-surface px-2 text-fg")}
          aria-label={`Status: ${value} (click to change)`}
          title="Change status"
        >
          <StatusIcon status={value} /> {!compact && value}
          {!compact && <ChevronDown className="h-3 w-3 text-faint" />}
        </button>
      )}
      items={(["Open", "In Progress", "Completed"] as TaskStatus[]).map((s) => ({ label: s, icon: <StatusIcon status={s} />, checked: s === value, onSelect: () => onChange(s) }))}
    />
  );
}

const priorityIcon: Record<Priority, JSX.Element> = {
  High: <ArrowUp className="h-3.5 w-3.5 text-red-500" />,
  Medium: <ArrowRight className="h-3.5 w-3.5 text-amber-500" />,
  Low: <ArrowDown className="h-3.5 w-3.5 text-faint" />,
};

export function PriorityMenu({ value, onChange, disabled = false }: { value: Priority; onChange?: (p: Priority) => void; disabled?: boolean }) {
  const label = (
    <span className="inline-flex items-center gap-1 text-[12px] text-muted" title={`${value} priority`}>
      {priorityIcon[value]}
    </span>
  );
  if (disabled || !onChange) return label;
  return (
    <Menu
      width={150}
      header="Priority"
      trigger={() => <button className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover">{label}</button>}
      items={(["High", "Medium", "Low"] as Priority[]).map((p) => ({ label: p, icon: priorityIcon[p], checked: p === value, onSelect: () => onChange(p) }))}
    />
  );
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export function useUsers() {
  return useQuery("users", () => api.listUsers(), { refreshMs: 60000 });
}

// `name` is the person heard in the meeting when they have no account (e.g. an external participant).
export function UserChip({ user, name, empty = "Unassigned" }: { user: User | null; name?: string | null; empty?: string }) {
  if (!user && name)
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5" title={`${name} was named in the meeting but has no MeetOps account. Assign the item to a member to track it.`}>
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-[9px] font-semibold text-muted">
          {name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
        </span>
        <span className="truncate text-[13px] text-fg">{name}</span>
        <span className="shrink-0 text-2xs text-faint">no account</span>
      </span>
    );
  return user ? (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Avatar name={user.name} initials={user.initials} size={20} />
      <span className="truncate text-[13px] text-fg">{user.name}</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-faint">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-line-strong">
        <UserRound className="h-3 w-3" />
      </span>
      {empty}
    </span>
  );
}

export function OwnerMenu({ value, name, onChange, disabled = false, empty = "Unassigned" }: { value: User | null; name?: string | null; onChange: (id: number | null) => void; disabled?: boolean; empty?: string }) {
  const users = useUsers();
  if (disabled) return <UserChip user={value} name={name} empty={empty} />;
  return (
    <Menu
      width={240}
      header="Assign to"
      trigger={() => (
        <button className="-mx-1.5 flex min-w-0 max-w-full items-center rounded-md px-1.5 py-1 hover:bg-hover">
          <UserChip user={value} name={name} empty={empty} />
        </button>
      )}
      items={[
        { label: empty, icon: <CircleDashed className="h-3.5 w-3.5" />, checked: value === null, onSelect: () => onChange(null) },
        "divider",
        ...(users.data ?? []).map((u) => ({
          label: u.name,
          icon: <Avatar name={u.name} initials={u.initials} size={16} />,
          hint: u.department?.name,
          checked: u.id === value?.id,
          onSelect: () => onChange(u.id),
        })),
      ]}
    />
  );
}

export function DueDate({ deadline, status, text, onChange, disabled = false }: { deadline: string | null; status: string; text?: string | null; onChange?: (d: string | null) => void; disabled?: boolean }) {
  const info = dueInfo(deadline, status);
  const toneCls = info.tone === "red" ? "text-red-600 dark:text-red-400" : info.tone === "amber" ? "text-amber-600 dark:text-amber-400" : deadline ? "text-muted" : "text-faint";
  const title = text ? `Said in the meeting: “${text}”` : undefined;
  if (disabled || !onChange)
    return (
      <span className={cn("whitespace-nowrap text-[12px]", toneCls)} title={title}>
        {deadline ? info.label : text ? <span className="italic">{text}</span> : "No date"}
      </span>
    );
  return (
    <label className={cn("relative inline-flex cursor-pointer items-center whitespace-nowrap rounded-md px-1.5 py-1 text-[12px] hover:bg-hover", toneCls)} title={title ?? "Change due date"}>
      {deadline ? info.label : text ? <span className="italic">{text}</span> : "No date"}
      <input
        type="date"
        value={deadline ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Due date"
      />
    </label>
  );
}
