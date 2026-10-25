import { Link } from "react-router-dom";
import {
  ListChecks,
  Gavel,
  ShieldAlert,
  CalendarDays,
  ArrowUpRight,
  AlertTriangle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { meetings, tasks, decisions, risks, personById } from "../data/mockData";
import {
  Avatar,
  Badge,
  formatDate,
  isOverdue,
  statusStyles,
  daysUntil,
} from "../components/ui";
import type { ReactNode } from "react";

const openTasks = tasks.filter((t) => t.status !== "Completed").length;
const overdueTasks = tasks.filter((t) => isOverdue(t.deadline, t.status)).length;
const highRisks = risks.filter((r) => r.severity === "High").length;

const statusData = [
  { name: "Open", value: tasks.filter((t) => t.status === "Open").length, color: "#94a3b8" },
  { name: "In Progress", value: tasks.filter((t) => t.status === "In Progress").length, color: "#3b82f6" },
  { name: "Completed", value: tasks.filter((t) => t.status === "Completed").length, color: "#10b981" },
];

// Extraction volume per processed meeting.
const perMeeting = meetings
  .filter((m) => m.status === "Processed")
  .map((m) => ({
    name: m.title.length > 16 ? m.title.slice(0, 15) + "…" : m.title,
    Tasks: m.taskCount,
    Decisions: m.decisionCount,
    Risks: m.riskCount,
  }));

const upcoming = [...tasks]
  .filter((t) => t.status !== "Completed")
  .sort((a, b) => a.deadline.localeCompare(b.deadline))
  .slice(0, 5);

function StatCard({
  label,
  value,
  icon,
  accent,
  to,
  hint,
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  accent: string;
  to: string;
  hint?: string;
}) {
  return (
    <Link
      to={to}
      className="card card-hover group relative overflow-hidden p-5"
    >
      <div className="flex items-start justify-between">
        <div className={`rounded-xl p-2.5 ${accent}`}>{icon}</div>
        <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-brand-500" />
      </div>
      <div className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">
        {value}
      </div>
      <div className="mt-1 text-sm font-medium text-slate-500">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </Link>
  );
}

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl bg-hero-gradient px-6 py-7 text-white shadow-lift sm:px-8">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 right-24 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
              Wednesday · 2 July 2026
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Welcome back, Chamodi 👋
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-white/80">
              MeetOps turned your recent meetings into structured tasks,
              decisions, and risks — here's the latest.
            </p>
          </div>
          <Link
            to="/upload"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-brand-700 shadow-soft transition hover:shadow-lift active:scale-[0.98]"
          >
            + Upload a meeting
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Open Tasks"
          value={openTasks}
          hint={`${overdueTasks} overdue`}
          icon={<ListChecks className="h-5 w-5 text-white" />}
          accent="bg-gradient-to-br from-sky-500 to-blue-600"
          to="/tasks"
        />
        <StatCard
          label="Decisions Logged"
          value={decisions.length}
          hint="across all meetings"
          icon={<Gavel className="h-5 w-5 text-white" />}
          accent="bg-gradient-to-br from-emerald-500 to-teal-600"
          to="/decisions"
        />
        <StatCard
          label="Open Risks"
          value={risks.length}
          hint={`${highRisks} high severity`}
          icon={<ShieldAlert className="h-5 w-5 text-white" />}
          accent="bg-gradient-to-br from-amber-500 to-orange-600"
          to="/risks"
        />
        <StatCard
          label="Meetings Processed"
          value={meetings.filter((m) => m.status === "Processed").length}
          hint={`${meetings.filter((m) => m.status === "Processing").length} processing`}
          icon={<CalendarDays className="h-5 w-5 text-white" />}
          accent="bg-brand-gradient"
          to="/meetings"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">
              Extracted items per meeting
            </h3>
            <span className="text-xs text-slate-400">Tasks · Decisions · Risks</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={perMeeting} barGap={4} barCategoryGap="24%">
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  fontSize: 13,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Tasks" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Decisions" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Risks" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 font-semibold text-slate-800">Task status</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                innerRadius={62}
                outerRadius={95}
                paddingAngle={3}
              >
                {statusData.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  fontSize: 13,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Lower row: recent meetings + upcoming deadlines */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Recent meetings</h3>
            <Link
              to="/meetings"
              className="text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {meetings.slice(0, 4).map((m) => (
              <Link
                key={m.id}
                to={`/meetings/${m.id}`}
                className="flex items-center justify-between gap-4 py-3 transition hover:bg-slate-50 -mx-2 px-2 rounded-lg"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800">
                    {m.title}
                  </div>
                  <div className="text-xs text-slate-400">
                    {formatDate(m.date)} · {m.durationMin} min
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {m.status === "Processing" ? (
                    <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
                      Processing…
                    </Badge>
                  ) : (
                    <>
                      <Badge className="bg-blue-50 text-blue-700 ring-blue-200">
                        {m.taskCount} tasks
                      </Badge>
                      <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                        {m.decisionCount} dec
                      </Badge>
                      <Badge className="bg-amber-50 text-amber-700 ring-amber-200">
                        {m.riskCount} risk
                      </Badge>
                    </>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Upcoming deadlines</h3>
            <Link
              to="/tasks"
              className="text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              All tasks
            </Link>
          </div>
          <div className="space-y-3">
            {upcoming.map((t) => {
              const owner = personById(t.ownerId);
              const overdue = isOverdue(t.deadline, t.status);
              const days = daysUntil(t.deadline);
              return (
                <div key={t.id} className="flex items-start gap-3">
                  <Avatar initials={owner.initials} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">
                      {t.description}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge className={statusStyles[t.status]}>{t.status}</Badge>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium ${
                          overdue ? "text-red-600" : "text-slate-400"
                        }`}
                      >
                        {overdue && <AlertTriangle className="h-3 w-3" />}
                        {overdue
                          ? `Overdue by ${Math.abs(days)}d`
                          : days === 0
                          ? "Due today"
                          : `Due in ${days}d`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend note for evaluators */}
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <span className="font-semibold text-slate-600">Demo note:</span> all data
        shown is sample data. In production these views are populated by the
        MeetOps pipeline (ASR → classification → information extraction) via the
        FastAPI backend.
      </div>
    </div>
  );
}
