/* eslint-disable react-refresh/only-export-components -- shared domain widgets and their style maps */
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
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
        <button className="inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[12px] text-muted hover:bg-hover hover:text-fg" aria-label={`Status: ${value}`}>
          <StatusIcon status={value} /> {!compact && value}
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

export function UserChip({ user, empty = "Unassigned" }: { user: User | null; empty?: string }) {
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

export function OwnerMenu({ value, onChange, disabled = false, empty = "Unassigned" }: { value: User | null; onChange: (id: number | null) => void; disabled?: boolean; empty?: string }) {
  const users = useUsers();
  if (disabled) return <UserChip user={value} empty={empty} />;
  return (
    <Menu
      width={240}
      header="Assign to"
      trigger={() => (
        <button className="-mx-1.5 flex min-w-0 max-w-full items-center rounded-md px-1.5 py-1 hover:bg-hover">
          <UserChip user={value} empty={empty} />
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
