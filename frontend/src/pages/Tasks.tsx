import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Search } from "lucide-react";
import { tasks as seedTasks, personById, meetingById } from "../data/mockData";
import {
  Avatar,
  Badge,
  PageHeader,
  formatDate,
  isOverdue,
  statusStyles,
  daysUntil,
} from "../components/ui";
import type { Task, TaskStatus } from "../types";

const statusOptions: (TaskStatus | "All")[] = [
  "All",
  "Open",
  "In Progress",
  "Completed",
];

export default function Tasks() {
  // Local copy so the status dropdown is interactive in the demo.
  const [tasks, setTasks] = useState<Task[]>(seedTasks);
  const [filter, setFilter] = useState<TaskStatus | "All">("All");
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (filter === "All" || t.status === filter) &&
          t.description.toLowerCase().includes(query.toLowerCase())
      ),
    [tasks, filter, query]
  );

  function updateStatus(id: string, status: TaskStatus) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  }

  const counts = {
    All: tasks.length,
    Open: tasks.filter((t) => t.status === "Open").length,
    "In Progress": tasks.filter((t) => t.status === "In Progress").length,
    Completed: tasks.filter((t) => t.status === "Completed").length,
  };

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
        </div>
        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search tasks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
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
              const owner = personById(t.ownerId);
              const meeting = meetingById(t.meetingId);
              const overdue = isOverdue(t.deadline, t.status);
              const days = daysUntil(t.deadline);
              return (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">
                      {t.description}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar initials={owner.initials} className="h-6 w-6 text-[10px]" />
                      <span className="text-slate-600">{owner.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {meeting ? (
                      <Link
                        to={`/meetings/${meeting.id}`}
                        className="text-brand-600 hover:underline"
                      >
                        {meeting.title}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-600">
                        {formatDate(t.deadline)}
                      </span>
                      {overdue && (
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
                      onChange={(e) =>
                        updateStatus(t.id, e.target.value as TaskStatus)
                      }
                      className={`cursor-pointer rounded-full border-0 px-2.5 py-1 text-xs font-semibold ring-1 ring-inset outline-none ${
                        statusStyles[t.status]
                      }`}
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
    </div>
  );
}
