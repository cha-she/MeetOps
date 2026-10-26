import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, Search } from "lucide-react";
import { api } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import {
  Avatar,
  Badge,
  EmptyState,
  PageHeader,
  QueryView,
  daysUntil,
  formatDate,
  isOverdue,
  statusStyles,
} from "../components/ui";
import type { Task, TaskStatus } from "../types";

const statusOptions: (TaskStatus | "All")[] = ["All", "Open", "In Progress", "Completed"];

export default function Tasks() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [filter, setFilter] = useState<TaskStatus | "All">("All");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const tasks = useQuery("tasks", () => api.listTasks({ sort: "deadline" }));

  // Scroll to a task when arriving from a notification or the dashboard.
  useEffect(() => {
    if (!highlightId || !tasks.data) return;
    document.getElementById(`task-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, tasks.data]);

  const counts = useMemo(() => {
    const list = tasks.data ?? [];
    return {
      All: list.length,
      Open: list.filter((t) => t.status === "Open").length,
      "In Progress": list.filter((t) => t.status === "In Progress").length,
      Completed: list.filter((t) => t.status === "Completed").length,
      overdue: list.filter((t) => isOverdue(t.deadline, t.status)).length,
    };
  }, [tasks.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (tasks.data ?? []).filter(
      (t) =>
        (filter === "All" || t.status === filter) &&
        (!overdueOnly || isOverdue(t.deadline, t.status)) &&
        (!q ||
          t.description.toLowerCase().includes(q) ||
          t.owner?.name.toLowerCase().includes(q) ||
          t.meetingTitle.toLowerCase().includes(q))
    );
  }, [tasks.data, filter, overdueOnly, query]);

  // Optimistic status update: change the row immediately, roll back on failure.
  async function updateStatus(task: Task, status: TaskStatus) {
    const previous = task.status;
    setSaveError(null);
    tasks.setData((prev) => prev?.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      const saved = await api.updateTask(task.id, { status });
      tasks.setData((prev) => prev?.map((t) => (t.id === task.id ? saved : t)));
    } catch (err) {
      tasks.setData((prev) => prev?.map((t) => (t.id === task.id ? { ...t, status: previous } : t)));
      setSaveError(err instanceof Error ? err.message : "Could not save the status change.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Task Tracker"
        subtitle="Tasks extracted from meetings, with owner, deadline, and status."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {statusOptions.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition ${
                filter === s
                  ? "bg-brand-600 text-white ring-brand-600"
                  : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {s}
              <span className="ml-1.5 opacity-70">{counts[s]}</span>
            </button>
          ))}
          <button
            onClick={() => setOverdueOnly((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition ${
              overdueOnly
                ? "bg-red-600 text-white ring-red-600"
                : "bg-white text-red-600 ring-red-200 hover:bg-red-50"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Overdue
            <span className="ml-1 opacity-70">{counts.overdue}</span>
          </button>
        </div>
        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search tasks, owners, meetings…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {saveError && (
        <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {saveError}
        </div>
      )}

      <QueryView
        {...tasks}
        onRetry={tasks.reload}
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            title="No tasks yet"
            message="Tasks appear here automatically once a meeting has been processed."
            action={<Link to="/upload" className="btn-primary">Upload a meeting</Link>}
          />
        }
      >
        {() => (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Task</th>
                  <th className="px-4 py-3 font-semibold">Owner</th>
                  <th className="px-4 py-3 font-semibold">Meeting</th>
                  <th className="px-4 py-3 font-semibold">Deadline</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((t) => {
                  const overdue = isOverdue(t.deadline, t.status);
                  const days = daysUntil(t.deadline);
                  const highlighted = String(t.id) === highlightId;
                  return (
                    <tr
                      id={`task-${t.id}`}
                      key={t.id}
                      className={`hover:bg-slate-50 ${highlighted ? "bg-brand-50/60" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{t.description}</div>
                        <div className="mt-0.5 line-clamp-1 text-xs text-slate-400">
                          “{t.evidence.quote}”
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar initials={t.owner?.initials ?? "?"} className="h-6 w-6 text-[10px]" />
                          <span className="text-slate-600">{t.owner?.name ?? "Unassigned"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/meetings/${t.meetingId}?segment=${t.evidence.segmentId}`}
                          className="text-brand-600 hover:underline"
                        >
                          {t.meetingTitle}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-600">{formatDate(t.deadline)}</span>
                          {overdue && days !== null && (
                            <Badge className="bg-red-50 text-red-700 ring-red-200">
                              <AlertTriangle className="h-3 w-3" />
                              {Math.abs(days)}d
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={t.status}
                          onChange={(e) => updateStatus(t, e.target.value as TaskStatus)}
                          className={`cursor-pointer rounded-full border-0 px-2.5 py-1 text-xs font-semibold outline-none ring-1 ring-inset ${
                            statusStyles[t.status]
                          }`}
                          aria-label={`Status of task ${t.id}`}
                        >
                          <option>Open</option>
                          <option>In Progress</option>
                          <option>Completed</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                      No tasks match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
    </div>
  );
}
