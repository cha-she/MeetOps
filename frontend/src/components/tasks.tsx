/* eslint-disable react-refresh/only-export-components -- task widgets and their hook */
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { api, type TaskPatch } from "../api/endpoints";
import { useMe } from "../auth/AuthContext";
import { canEditTask } from "../auth/permissions";
import { useMutation } from "../hooks/useMutation";
import type { Meeting, Priority, Task, TaskStatus } from "../types";
import {
  ConfidenceMeter,
  DueDate,
  EvidenceQuote,
  EvidenceTime,
  OwnerMenu,
  PriorityMenu,
  ReviewBadge,
  ReviewButtons,
  StatusIcon,
  StatusMenu,
  useUsers,
} from "./items";
import { Avatar, Dialog, EmptyState, Field, cn, daysUntil, formatDate, isOverdue } from "./ui";

export const TASK_REFRESH = ["tasks", "insights", "review", "meetings", "activity", "notifications"];

export function useTaskActions() {
  const { run, busy } = useMutation();
  const update = (task: Task, patch: TaskPatch, success?: string) =>
    run(() => api.updateTask(task.id, patch), { success, refresh: TASK_REFRESH });
  const confirm = (task: Task) => update(task, { reviewStatus: "confirmed" }, "Task confirmed");
  const reject = (task: Task) =>
    run(() => api.updateTask(task.id, { reviewStatus: "rejected" }), {
      success: "Task rejected. The correction is saved for retraining.",
      refresh: TASK_REFRESH,
      undo: () => api.updateTask(task.id, { reviewStatus: "suggested" }),
    });
  return { update, confirm, reject, busy };
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

export type GroupBy = "none" | "status" | "owner" | "meeting" | "due";

function dueBucket(t: Task): string {
  if (t.status === "Completed") return "5 Completed";
  const d = daysUntil(t.deadline);
  if (d === null) return "4 No due date";
  if (d < 0) return "0 Overdue";
  if (d === 0) return "1 Today";
  if (d < 7) return "2 This week";
  return "3 Later";
}

function groupTasks(tasks: Task[], by: GroupBy): [string, Task[]][] {
  if (by === "none") return [["", tasks]];
  const key = (t: Task) =>
    by === "status" ? ({ Open: "1 Open", "In Progress": "0 In Progress", Completed: "2 Completed" } as const)[t.status]
    : by === "owner" ? (t.owner ? `1 ${t.owner.name}` : "2 Unassigned")
    : by === "meeting" ? `${t.meetingDate} ${t.meetingTitle}`
    : dueBucket(t);
  const map = new Map<string, Task[]>();
  tasks.forEach((t) => map.set(key(t), [...(map.get(key(t)) ?? []), t]));
  const entries = [...map.entries()].sort(([a], [b]) => (by === "meeting" ? b.localeCompare(a) : a.localeCompare(b)));
  return entries.map(([k, v]) => [by === "meeting" ? k.slice(11) : k.slice(2), v]);
}

// Round tick in front of every task: one click marks it completed, another click reopens it.
function CompleteToggle({ task, disabled, onToggle }: { task: Task; disabled: boolean; onToggle: (s: TaskStatus) => void }) {
  const done = task.status === "Completed";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(done ? "Open" : "Completed")}
      title={disabled ? "Only the owner, their manager or an admin can change this" : done ? "Reopen task" : "Mark as complete"}
      aria-label={done ? "Reopen task" : "Mark as complete"}
      className={cn(
        "group/tick mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60",
        done ? "border-emerald-500 bg-emerald-500 text-white" : "border-line-strong text-transparent hover:border-emerald-500 hover:text-emerald-500"
      )}
    >
      <Check className="h-3 w-3" strokeWidth={3} />
    </button>
  );
}

function TaskRow({ task, showMeeting, compact }: { task: Task; showMeeting: boolean; compact: boolean }) {
  const me = useMe();
  const editable = canEditTask(me, task);
  const { update, confirm, reject, busy } = useTaskActions();
  const done = task.status === "Completed";
  if (compact)
    return (
      <div id={`task-${task.id}`} className={cn("grid grid-cols-[auto_1fr] items-start gap-x-2 border-b border-line px-3 py-2.5 last:border-0 hover:bg-hover/50", task.reviewStatus === "suggested" && "bg-amber-500/[0.03]")}>
        <CompleteToggle task={task} disabled={!editable} onToggle={(s) => update(task, { status: s }, s === "Completed" ? "Marked as completed" : "Reopened")} />
        <div className="min-w-0 py-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("text-[13px] font-medium text-fg", done && "text-muted line-through decoration-faint")}>{task.description}</span>
            <ReviewBadge status={task.reviewStatus} source={task.source} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusMenu value={task.status} disabled={!editable} onChange={(s) => update(task, { status: s }, `Status: ${s}`)} />
            <OwnerMenu value={task.owner} name={task.ownerName} disabled={!editable} onChange={(id) => update(task, { ownerId: id }, "Owner updated")} />
            <DueDate deadline={task.deadline} text={task.deadlineText} status={task.status} disabled={!editable} onChange={(d) => update(task, { deadline: d }, "Due date updated")} />
            <PriorityMenu value={task.priority} disabled={!editable} onChange={(p) => update(task, { priority: p })} />
            <EvidenceTime evidence={task.evidence} meetingId={task.meetingId} />
          </div>
          {task.reviewStatus === "suggested" && editable && (
            <div className="mt-1.5 flex items-center gap-3">
              <ReviewButtons size="sm" busy={busy} onConfirm={() => confirm(task)} onReject={() => reject(task)} />
              <ConfidenceMeter value={task.confidence} source={task.source} />
            </div>
          )}
        </div>
      </div>
    );
  return (
    <div id={`task-${task.id}`} className={cn("group grid grid-cols-[auto_1fr] items-start gap-x-2 border-b border-line px-3 py-2 last:border-0 hover:bg-hover/50 md:grid-cols-[auto_1fr_128px_170px_110px_32px] md:items-center", task.reviewStatus === "suggested" && "bg-amber-500/[0.03]")}>
      <CompleteToggle task={task} disabled={!editable} onToggle={(s) => update(task, { status: s }, s === "Completed" ? "Marked as completed" : "Reopened")} />
      <div className="min-w-0 py-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("text-[13px] font-medium text-fg", done && "text-muted line-through decoration-faint")}>{task.description}</span>
          <ReviewBadge status={task.reviewStatus} source={task.source} />
          {showMeeting && (
            <Link to={`/meetings/${task.meetingId}`} className="truncate text-2xs text-faint hover:text-accent-text">
              {task.meetingTitle}
            </Link>
          )}
        </div>
        <EvidenceQuote evidence={task.evidence} meetingId={task.meetingId} className="mt-0.5" />
        {task.reviewStatus === "suggested" && editable && (
          <div className="mt-1.5 flex items-center gap-3">
            <ReviewButtons size="sm" busy={busy} onConfirm={() => confirm(task)} onReject={() => reject(task)} />
            <ConfidenceMeter value={task.confidence} source={task.source} />
          </div>
        )}
      </div>
      <div className="col-start-2 md:col-start-auto">
        <StatusMenu value={task.status} disabled={!editable} onChange={(s) => update(task, { status: s }, `Status: ${s}`)} />
      </div>
      <div className="col-start-2 flex min-w-0 items-center gap-2 md:col-start-auto">
        <OwnerMenu value={task.owner} name={task.ownerName} disabled={!editable} onChange={(id) => update(task, { ownerId: id }, "Owner updated")} />
      </div>
      <div className="col-start-2 md:col-start-auto">
        <DueDate deadline={task.deadline} text={task.deadlineText} status={task.status} disabled={!editable} onChange={(d) => update(task, { deadline: d }, "Due date updated")} />
      </div>
      <div className="hidden md:block">
        <PriorityMenu value={task.priority} disabled={!editable} onChange={(p) => update(task, { priority: p })} />
      </div>
    </div>
  );
}

export function TaskList({ tasks, groupBy = "none", showMeeting = true, empty, compact = false }: { tasks: Task[]; groupBy?: GroupBy; showMeeting?: boolean; empty?: ReactNode; compact?: boolean }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  if (tasks.length === 0) return <>{empty ?? <EmptyState compact title="No tasks match" message="Try clearing a filter." />}</>;
  return (
    <div>
      <div className={cn("hidden grid-cols-[auto_1fr_128px_170px_110px_32px] gap-x-2 border-b border-line bg-subtle/60 px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-faint", !compact && "md:grid")}>
        <span className="w-7" />
        <span>Task</span>
        <span>Status</span>
        <span>Owner</span>
        <span>Due</span>
        <span />
      </div>
      {groupTasks(tasks, groupBy).map(([label, items]) => (
        <div key={label || "all"}>
          {label && (
            <button onClick={() => setCollapsed((c) => ({ ...c, [label]: !c[label] }))} className="flex w-full items-center gap-1.5 border-b border-line bg-subtle/40 px-3 py-1.5 text-left text-[12px] font-semibold text-muted hover:text-fg">
              {collapsed[label] ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              <span className={cn(label === "Overdue" && "text-red-600 dark:text-red-400")}>{label}</span>
              <span className="font-normal text-faint">{items.length}</span>
            </button>
          )}
          {!collapsed[label] && items.map((t) => <TaskRow key={t.id} task={t} showMeeting={showMeeting} compact={compact} />)}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board view (drag a card to another column to change its status)
// ---------------------------------------------------------------------------

const COLUMNS: TaskStatus[] = ["Open", "In Progress", "Completed"];

export function TaskBoard({ tasks }: { tasks: Task[] }) {
  const me = useMe();
  const { update } = useTaskActions();
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);

  function drop(status: TaskStatus) {
    const task = tasks.find((t) => t.id === dragId);
    setDragId(null);
    setOver(null);
    if (task && task.status !== status && canEditTask(me, task)) update(task, { status }, `Moved to ${status}`);
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const items = tasks.filter((t) => t.status === col);
        return (
          <div
            key={col}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(col);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={() => drop(col)}
            className={cn("flex min-h-[300px] flex-col rounded-lg border border-line bg-subtle/50 p-2 transition", over === col && "border-accent/50 bg-accent-soft/50")}
          >
            <div className="flex items-center gap-2 px-1.5 pb-2 pt-1 text-[12px] font-semibold text-muted">
              <StatusIcon status={col} /> {col} <span className="font-normal text-faint">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((t) => {
                const editable = canEditTask(me, t);
                const overdue = isOverdue(t.deadline, t.status);
                return (
                  <div
                    key={t.id}
                    draggable={editable}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => setDragId(null)}
                    className={cn("rounded-md border border-line bg-surface p-2.5 shadow-card transition", editable && "cursor-grab active:cursor-grabbing", dragId === t.id && "opacity-50")}
                  >
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <span className="text-[13px] font-medium leading-snug text-fg">{t.description}</span>
                      <PriorityMenu value={t.priority} disabled />
                    </div>
                    <Link to={`/meetings/${t.meetingId}`} className="block truncate text-2xs text-faint hover:text-accent-text">
                      {t.meetingTitle}
                    </Link>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className={cn("text-2xs", overdue ? "font-medium text-red-600 dark:text-red-400" : "text-faint")}>{t.deadline ? formatDate(t.deadline) : t.deadlineText ?? "No date"}</span>
                      <span className="flex items-center gap-1.5">
                        {t.reviewStatus === "suggested" && <ReviewBadge status="suggested" />}
                        {t.owner ? <Avatar name={t.owner.name} initials={t.owner.initials} size={20} /> : <span className="text-2xs text-faint">{t.ownerName ?? "Unassigned"}</span>}
                      </span>
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && <div className="rounded-md border border-dashed border-line px-3 py-6 text-center text-[12px] text-faint">Drop tasks here</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New task dialog
// ---------------------------------------------------------------------------

export function NewTaskDialog({ open, onClose, meetings, defaultMeetingId, segmentId, defaultDescription = "" }: { open: boolean; onClose: () => void; meetings: Meeting[]; defaultMeetingId?: number; segmentId?: number; defaultDescription?: string }) {
  const users = useUsers();
  const { run, busy } = useMutation();
  const [form, setForm] = useState({ description: defaultDescription, meetingId: defaultMeetingId ?? meetings[0]?.id ?? 0, ownerId: 0, deadline: "", priority: "Medium" as Priority });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const created = await run(
      () => api.createTask({ description: form.description.trim(), meetingId: Number(form.meetingId), ownerId: form.ownerId || null, deadline: form.deadline || null, priority: form.priority, segmentId }),
      { success: "Task added", refresh: TASK_REFRESH }
    );
    if (created) {
      setForm((f) => ({ ...f, description: "", deadline: "" }));
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New task"
      description="Add an action item the system missed, linked to its meeting."
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" form="new-task" disabled={busy || form.description.trim().length < 3 || !form.meetingId}>
            Create task
          </button>
        </>
      }
    >
      <form id="new-task" onSubmit={submit} className="space-y-3">
        <Field label="What needs to be done">
          <textarea className="field" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} autoFocus required minLength={3} />
        </Field>
        <Field label="Meeting">
          <select className="field" value={form.meetingId} onChange={(e) => setForm({ ...form, meetingId: Number(e.target.value) })} disabled={!!defaultMeetingId}>
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} · {formatDate(m.date)}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Owner">
            <select className="field" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: Number(e.target.value) })}>
              <option value={0}>Unassigned</option>
              {(users.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due date">
            <input className="field" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
          </Field>
          <Field label="Priority">
            <select className="field" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </Field>
        </div>
      </form>
    </Dialog>
  );
}
