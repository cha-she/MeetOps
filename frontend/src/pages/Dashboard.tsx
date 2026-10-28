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
import type { ReactNode } from "react";
import { api } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { CURRENT_USER } from "../config";
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  QueryView,
  Skeleton,
  dueLabel,
  formatDate,
  formatDuration,
  formatLongDate,
  isOverdue,
  statusStyles,
} from "../components/ui";

const statusColors: Record<string, string> = {
  Open: "#94a3b8",
  "In Progress": "#3b82f6",
  Completed: "#10b981",
};

const tooltipStyle = { borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 };

function StatCard({
  label,
  value,
  icon,
  accent,
  to,
  hint,
}: {
  label: string;
  value: number | string | undefined;
  icon: ReactNode;
  accent: string;
  to: string;
  hint?: string;
}) {
  return (
    <Link to={to} className="card card-hover group relative overflow-hidden p-5">
      <div className="flex items-start justify-between">
        <div className={`rounded-xl p-2.5 ${accent}`}>{icon}</div>
        <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-brand-500" />
      </div>
      <div className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">
        {value === undefined ? <Skeleton className="h-8 w-12" /> : value}
      </div>
      <div className="mt-1 text-sm font-medium text-slate-500">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </Link>
  );
}

export default function Dashboard() {
  const animate = !useReducedMotion();
  const insights = useQuery("insights", () => api.insights());
  const recent = useQuery("meetings:recent", () => api.listMeetings({ limit: 4 }));
  const upcoming = useQuery("tasks:upcoming", () =>
    api.listTasks({ status: "", sort: "deadline", limit: 5 })
  );

  const t = insights.data?.totals;
  const firstName = CURRENT_USER.name.split(" ")[0];

  return (
    <div className="space-y-6">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl bg-hero-gradient px-6 py-7 text-white shadow-lift sm:px-8">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 right-24 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
              {formatLongDate(new Date())}
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Welcome back, {firstName}
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-white/80">
              MeetOps turns your meetings into structured tasks, decisions, and risks.
              Here is the latest across your workspace.
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

      {insights.error && !insights.data ? (
        <ErrorState error={insights.error} onRetry={insights.reload} />
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Open Tasks"
              value={t?.openTasks}
              hint={t ? `${t.overdueTasks} overdue` : undefined}
              icon={<ListChecks className="h-5 w-5 text-white" />}
              accent="bg-gradient-to-br from-sky-500 to-blue-600"
              to="/tasks"
            />
            <StatCard
              label="Decisions Logged"
              value={t?.decisions}
              hint="across all meetings"
              icon={<Gavel className="h-5 w-5 text-white" />}
              accent="bg-gradient-to-br from-emerald-500 to-teal-600"
              to="/decisions"
            />
            <StatCard
              label="Risks Logged"
              value={t?.risks}
              hint={t ? `${t.highRisks} high severity` : undefined}
              icon={<ShieldAlert className="h-5 w-5 text-white" />}
              accent="bg-gradient-to-br from-amber-500 to-orange-600"
              to="/risks"
            />
            <StatCard
              label="Meetings Processed"
              value={t?.processedMeetings}
              hint={t ? `${t.processingMeetings} processing` : undefined}
              icon={<CalendarDays className="h-5 w-5 text-white" />}
              accent="bg-brand-gradient"
              to="/meetings"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="card p-5 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">Extracted items per meeting</h3>
                <span className="text-xs text-slate-400">Tasks · Decisions · Risks</span>
              </div>
              {insights.data && insights.data.itemsPerMeeting.length === 0 ? (
                <ChartEmpty />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={insights.data?.itemsPerMeeting ?? []}
                    barGap={4}
                    barCategoryGap="24%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="tasks" name="Tasks" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={animate} />
                    <Bar dataKey="decisions" name="Decisions" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={animate} />
                    <Bar dataKey="risks" name="Risks" fill="#f59e0b" radius={[4, 4, 0, 0]} isAnimationActive={animate} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card p-5">
              <h3 className="mb-4 font-semibold text-slate-800">Task status</h3>
              {insights.data && insights.data.totals.tasks === 0 ? (
                <ChartEmpty />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={insights.data?.taskStatus ?? []}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={95}
                      paddingAngle={3}
                      isAnimationActive={animate}
                    >
                      {(insights.data?.taskStatus ?? []).map((d) => (
                        <Cell key={d.name} fill={statusColors[d.name] ?? "#cbd5e1"} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}

      {/* Lower row: recent meetings + upcoming deadlines */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Recent meetings</h3>
            <Link to="/meetings" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          <QueryView
            {...recent}
            onRetry={recent.reload}
            skeleton={<RowsSkeleton />}
            isEmpty={(d) => d.length === 0}
            empty={
              <EmptyState
                title="No meetings yet"
                message="Upload a transcript to see it analysed here."
                action={<Link to="/upload" className="btn-primary">Upload a meeting</Link>}
              />
            }
          >
            {(meetings) => (
              <div className="divide-y divide-slate-100">
                {meetings.map((m) => (
                  <Link
                    key={m.id}
                    to={`/meetings/${m.id}`}
                    className="-mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-3 transition hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-800">{m.title}</div>
                      <div className="text-xs text-slate-400">
                        {formatDate(m.date)} · {formatDuration(m.durationMin)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {m.status === "Processed" ? (
                        <>
                          <Badge className="bg-blue-50 text-blue-700 ring-blue-200">{m.taskCount} tasks</Badge>
                          <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">{m.decisionCount} dec</Badge>
                          <Badge className="bg-amber-50 text-amber-700 ring-amber-200">{m.riskCount} risk</Badge>
                        </>
                      ) : m.status === "Failed" ? (
                        <Badge className="bg-red-50 text-red-700 ring-red-200">Failed</Badge>
                      ) : (
                        <Badge className="bg-brand-50 text-brand-700 ring-brand-200">Processing…</Badge>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </QueryView>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Upcoming deadlines</h3>
            <Link to="/tasks" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
              All tasks
            </Link>
          </div>
          <QueryView
            {...upcoming}
            onRetry={upcoming.reload}
            skeleton={<RowsSkeleton />}
            isEmpty={(d) => d.filter((x) => x.status !== "Completed").length === 0}
            empty={<p className="py-6 text-center text-sm text-slate-400">No open tasks.</p>}
          >
            {(tasks) => (
              <div className="space-y-3">
                {tasks
                  .filter((task) => task.status !== "Completed")
                  .map((task) => {
                    const overdue = isOverdue(task.deadline, task.status);
                    return (
                      <Link key={task.id} to={`/tasks?highlight=${task.id}`} className="flex items-start gap-3">
                        <Avatar initials={task.owner?.initials ?? "?"} title={task.owner?.name ?? "Unassigned"} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-slate-800">{task.description}</div>
                          <div className="mt-1 flex items-center gap-2">
                            <Badge className={statusStyles[task.status]}>{task.status}</Badge>
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-medium ${
                                overdue ? "text-red-600" : "text-slate-400"
                              }`}
                            >
                              {overdue && <AlertTriangle className="h-3 w-3" />}
                              {dueLabel(task.deadline, task.status)}
                            </span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
              </div>
            )}
          </QueryView>
        </div>
      </div>
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="space-y-4 py-1">
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

function ChartEmpty() {
  return (
    <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">
      No data yet — upload a meeting to populate this chart.
    </div>
  );
}
