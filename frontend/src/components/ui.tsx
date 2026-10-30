/* eslint-disable react-refresh/only-export-components -- shared helpers and components live together on purpose */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, ChevronDown, Inbox, RefreshCw, Search, ServerOff, X } from "lucide-react";
import type { ApiError } from "../api/client";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

const pad = (n: number) => String(n).padStart(2, "0");

export function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIso(iso: string): Date {
  return iso.length === 10 ? new Date(iso + "T00:00:00") : new Date(iso);
}

export function formatDate(iso: string | null | undefined, withYear = false): string {
  if (!iso) return "—";
  return parseIso(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}

export function formatLongDate(iso: string | Date): string {
  const d = typeof iso === "string" ? parseIso(iso) : iso;
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatDate(iso);
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((parseIso(iso).getTime() - today.getTime()) / 86_400_000);
}

export function isOverdue(deadline: string | null, status: string): boolean {
  const d = daysUntil(deadline);
  return status !== "Completed" && d !== null && d < 0;
}

export type Tone = "neutral" | "accent" | "blue" | "green" | "amber" | "red" | "violet";

export function dueInfo(deadline: string | null, status: string): { label: string; tone: Tone } {
  const d = daysUntil(deadline);
  if (d === null) return { label: "No date", tone: "neutral" };
  if (status === "Completed") return { label: formatDate(deadline), tone: "neutral" };
  if (d < 0) return { label: `${Math.abs(d)}d overdue`, tone: "red" };
  if (d === 0) return { label: "Today", tone: "amber" };
  if (d === 1) return { label: "Tomorrow", tone: "amber" };
  if (d < 7) return { label: parseIso(deadline!).toLocaleDateString("en-GB", { weekday: "short" }) + " " + formatDate(deadline), tone: "neutral" };
  return { label: formatDate(deadline), tone: "neutral" };
}

export function formatDuration(min: number | null): string {
  if (min === null) return "—";
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}m`;
}

export function pct(v: number | null | undefined, digits = 0): string {
  return v === null || v === undefined ? "—" : `${v.toFixed(digits)}%`;
}

// ---------------------------------------------------------------------------
// Badges, avatars
// ---------------------------------------------------------------------------

export const toneClass: Record<Tone, string> = {
  neutral: "bg-subtle text-muted ring-line",
  accent: "bg-accent-soft text-accent-text ring-accent/20",
  blue: "bg-blue-500/10 text-blue-700 ring-blue-500/20 dark:text-blue-300",
  green: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300",
  amber: "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300",
  red: "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-300",
  violet: "bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300",
};

export const dotClass: Record<Tone, string> = {
  neutral: "bg-faint",
  accent: "bg-accent",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  violet: "bg-violet-500",
};

export function Badge({ children, tone = "neutral", className = "", title }: { children: ReactNode; tone?: Tone; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex h-5 items-center gap-1 whitespace-nowrap rounded px-1.5 text-2xs font-medium ring-1 ring-inset", toneClass[tone], className)}>
      {children}
    </span>
  );
}

export function Dot({ tone, className = "" }: { tone: Tone; className?: string }) {
  return <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", dotClass[tone], className)} />;
}

const avatarColors = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

function colorFor(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) % 9973;
  return avatarColors[n % avatarColors.length];
}

export function Avatar({ name, initials, size = 24, className = "" }: { name?: string | null; initials?: string | null; size?: number; className?: string }) {
  const label = initials ?? (name ? name.split(" ").map((p) => p[0]).slice(0, 2).join("") : "?");
  return (
    <span
      title={name ?? undefined}
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.4), background: name ? colorFor(name) : "rgb(var(--faint))" }}
    >
      {label.toUpperCase()}
    </span>
  );
}

export function AvatarStack({ people, max = 4, size = 22 }: { people: { name: string; initials: string }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((p) => (
        <Avatar key={p.name} name={p.name} initials={p.initials} size={size} className="ring-2 ring-surface" />
      ))}
      {people.length > max && (
        <span className="inline-flex items-center justify-center rounded-full bg-subtle text-2xs font-medium text-muted ring-2 ring-surface" style={{ width: size, height: size }}>
          +{people.length - max}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page structure
// ---------------------------------------------------------------------------

export function PageHeader({ title, description, actions, icon }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-fg">
          {icon}
          {title}
        </h1>
        {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, actions, children, className = "", bodyClassName = "", icon }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; icon?: ReactNode }) {
  return (
    <section className={cn("panel", className)}>
      {(title || actions) && (
        <div className="panel-header">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-fg">
            {icon}
            {title}
          </h2>
          {actions}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone, icon, onClick }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; icon?: ReactNode; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={cn("panel flex flex-col gap-1 p-4 text-left", onClick && "transition hover:border-line-strong hover:bg-hover/40")}>
      <div className="flex items-center justify-between text-[12px] font-medium text-muted">
        <span className="flex items-center gap-1.5">
          {tone && <Dot tone={tone} />}
          {label}
        </span>
        {icon && <span className="text-faint">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold tabular-nums tracking-tight text-fg">{value}</div>
      {hint && <div className="text-[12px] text-faint">{hint}</div>}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Loading, empty and error states
// ---------------------------------------------------------------------------

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-subtle", className)} />;
}

export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, message, action, compact = false }: { icon?: ReactNode; title: string; message?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-16")}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-subtle text-faint">{icon ?? <Inbox className="h-5 w-5" />}</div>
      <div className="text-[13px] font-semibold text-fg">{title}</div>
      {message && <p className="mt-1 max-w-sm text-[13px] text-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError | Error; onRetry?: () => void }) {
  const offline = "isNetworkError" in error && (error as ApiError).isNetworkError;
  return (
    <EmptyState
      icon={offline ? <ServerOff className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5 text-red-500" />}
      title={offline ? "Server not reachable" : "Something went wrong"}
      message={error.message}
      action={
        onRetry && (
          <button className="btn-secondary" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
        )
      }
    />
  );
}

export function QueryView<T>({
  data,
  loading,
  error,
  onRetry,
  skeleton,
  isEmpty,
  empty,
  children,
}: {
  data: T | undefined;
  loading: boolean;
  error: ApiError | null;
  onRetry?: () => void;
  skeleton?: ReactNode;
  isEmpty?: (d: T) => boolean;
  empty?: ReactNode;
  children: (d: T) => ReactNode;
}) {
  if (error && data === undefined) return <ErrorState error={error} onRetry={onRetry} />;
  if (data === undefined || loading) return <>{skeleton ?? <RowsSkeleton />}</>;
  if (isEmpty?.(data) && empty) return <>{empty}</>;
  return <>{children(data)}</>;
}

// ---------------------------------------------------------------------------
// Overlays: dialog, confirm, menu
// ---------------------------------------------------------------------------

export function Dialog({ open, onClose, title, description, children, footer, width = 480 }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[10vh] animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className="w-full rounded-xl border border-line bg-surface shadow-pop animate-pop-in" style={{ maxWidth: width }}>
        <div className="flex items-start justify-between gap-4 px-5 pb-1 pt-4">
          <div>
            <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          <button className="icon-btn -mr-2 -mt-1 h-7 w-7" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-3">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", danger = false, busy = false, onConfirm, onClose }: { open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width={420}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className={danger ? "btn-danger" : "btn-primary"} disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-[13px] text-muted">{message}</div>
    </Dialog>
  );
}

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
}

export function Menu({ trigger, items, align = "left", width = 200, header }: { trigger: (open: boolean) => ReactNode; items: (MenuItem | "divider")[]; align?: "left" | "right"; width?: number; header?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative inline-block" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div className={cn("absolute z-40 mt-1 rounded-lg border border-line bg-surface p-1 shadow-pop animate-pop-in", align === "right" ? "right-0" : "left-0")} style={{ width }}>
          {header && <div className="px-2 pb-1.5 pt-1 text-2xs font-semibold uppercase tracking-wider text-faint">{header}</div>}
          {items.map((item, i) =>
            item === "divider" ? (
              <div key={i} className="my-1 h-px bg-line" />
            ) : (
              <button
                key={i}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition disabled:opacity-40",
                  item.danger ? "text-red-600 hover:bg-red-500/10 dark:text-red-400" : "text-fg hover:bg-hover"
                )}
              >
                {item.icon && <span className="flex w-4 justify-center text-muted">{item.icon}</span>}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint && <span className="text-2xs text-faint">{item.hint}</span>}
                {item.checked && <Check className="h-3.5 w-3.5 text-accent" />}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form and filter controls
// ---------------------------------------------------------------------------

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: ReactNode; error?: string | null }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-muted">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[12px] text-faint">{hint}</span>}
      {error && <span className="mt-1 block text-[12px] text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search…", className = "" }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
      <input className="field pl-8" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && (
        <button className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-fg" onClick={() => onChange("")} aria-label="Clear search">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export interface Option<V extends string | number> {
  value: V;
  label: string;
}

// Compact filter dropdown: shows "Label: value" and highlights when a value is set.
export function FilterSelect<V extends string | number>({ label, value, options, onChange, allLabel = "All", icon }: { label: string; value: V | ""; options: Option<V>[]; onChange: (v: V | "") => void; allLabel?: string; icon?: ReactNode }) {
  const current = options.find((o) => o.value === value);
  return (
    <Menu
      width={220}
      header={label}
      trigger={() => (
        <button className={cn("btn-secondary h-8 gap-1 px-2.5", current && "border-accent/40 bg-accent-soft text-accent-text")}>
          {icon}
          <span className="text-muted">{label}</span>
          {current && <span className="max-w-[140px] truncate font-medium">{current.label}</span>}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      )}
      items={[
        { label: allLabel, onSelect: () => onChange(""), checked: value === "" },
        "divider",
        ...options.map((o) => ({ label: o.label, onSelect: () => onChange(o.value), checked: o.value === value })),
      ]}
    />
  );
}

export function DateRange({ from, to, onChange, label = "Date" }: { from: string; to: string; onChange: (from: string, to: string) => void; label?: string }) {
  const active = from || to;
  return (
    <div className={cn("flex h-8 items-center gap-1 rounded-md border border-line bg-surface px-2 text-[13px] shadow-card", active && "border-accent/40 bg-accent-soft")}>
      <span className="text-muted">{label}</span>
      <input type="date" value={from} onChange={(e) => onChange(e.target.value, to)} className="w-[118px] bg-transparent text-[12px] text-fg outline-none" aria-label={`${label} from`} />
      <span className="text-faint">–</span>
      <input type="date" value={to} onChange={(e) => onChange(from, e.target.value)} className="w-[118px] bg-transparent text-[12px] text-fg outline-none" aria-label={`${label} to`} />
      {active && (
        <button className="text-faint hover:text-fg" onClick={() => onChange("", "")} aria-label="Clear dates">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function Toggle({ active, onClick, children, tone }: { active: boolean; onClick: () => void; children: ReactNode; tone?: "red" | "accent" }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "btn-secondary h-8 px-2.5",
        active && (tone === "red" ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300" : "border-accent/40 bg-accent-soft text-accent-text")
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<V extends string>({ value, options, onChange }: { value: V; options: { value: V; label: ReactNode; count?: number }[]; onChange: (v: V) => void }) {
  return (
    <div className="inline-flex h-8 items-center rounded-md border border-line bg-subtle p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn("flex h-full items-center gap-1.5 rounded px-2.5 text-[12px] font-medium transition", value === o.value ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}
        >
          {o.label}
          {o.count !== undefined && <span className="tabular-nums text-faint">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Tabs<V extends string>({ value, tabs, onChange }: { value: V; tabs: { value: V; label: ReactNode; count?: number }[]; onChange: (v: V) => void }) {
  return (
    <div className="flex gap-4 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn("-mb-px flex items-center gap-1.5 border-b-2 pb-2 pt-1 text-[13px] font-medium transition", value === t.value ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded bg-subtle px-1.5 text-2xs tabular-nums text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, tone = "accent", className = "" }: { value: number; tone?: Tone; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-subtle", className)}>
      <div className={cn("h-full rounded-full transition-all", dotClass[tone])} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

// Download rows as CSV (Excel-friendly) in the browser.
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
