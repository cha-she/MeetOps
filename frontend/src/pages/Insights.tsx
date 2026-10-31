import { Link } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LineChart, Repeat } from "lucide-react";
import { api } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import { Badge, EmptyState, PageHeader, Panel, ProgressBar, QueryView, Skeleton, Stat, pct } from "../components/ui";
import { LIST_REFRESH_INTERVAL_MS } from "../config";
import { accentColor } from "../hooks/useTheme";

const C = { blue: "#3b82f6", green: "#10b981", amber: "#f59e0b", red: "#ef4444", grey: "#a1a1aa" };
const axis = { fontSize: 11, fill: "rgb(var(--faint))" };
const tooltip = { contentStyle: { background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 8, fontSize: 12, color: "rgb(var(--fg))" }, cursor: { fill: "rgb(var(--hover))" } };

export default function Insights() {
  const insights = useQuery("insights", () => api.insights(), { refreshMs: LIST_REFRESH_INTERVAL_MS });
  const accent = accentColor();

  return (
    <div>
      <PageHeader icon={<LineChart className="h-5 w-5 text-faint" />} title="Insights" description="Delivery, workload and risk across all meetings and departments." />
      <QueryView
        {...insights}
        onRetry={insights.reload}
        skeleton={<div className="grid gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>}
        isEmpty={(d) => d.totals.meetings === 0}
        empty={<div className="panel"><EmptyState title="No data yet" message="Insights are calculated from processed meetings." action={<Link to="/upload" className="btn-primary">Upload a meeting</Link>} /></div>}
      >
        {(d) => (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Task completion" value={pct(d.completionRate)} hint={`${d.totals.tasks - d.totals.openTasks} of ${d.totals.tasks} tasks done`} tone="green" />
              <Stat label="On-time delivery" value={pct(d.onTimeRate)} hint="Completed tasks finished by their due date" tone="blue" />
              <Stat label="Overdue now" value={d.totals.overdueTasks} hint={`${d.totals.dueThisWeek} more due this week`} tone="red" />
              <Stat label="Review acceptance" value={pct(d.reviewAcceptanceRate)} hint="Suggestions people confirmed rather than rejected" tone="violet" />
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
              <Panel title="Tasks created vs completed per week">
                <div className="h-[260px] p-3">
                  <ResponsiveContainer>
                    <AreaChart data={d.weekly} margin={{ left: -20, right: 8, top: 8 }}>
                      <defs>
                        <linearGradient id="gCreated" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={accent} stopOpacity={0.25} /><stop offset="100%" stopColor={accent} stopOpacity={0} /></linearGradient>
                        <linearGradient id="gDone" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.green} stopOpacity={0.25} /><stop offset="100%" stopColor={C.green} stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
                      <XAxis dataKey="week" tick={axis} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
                      <Tooltip {...tooltip} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="created" name="Created" stroke={accent} fill="url(#gCreated)" strokeWidth={2} />
                      <Area type="monotone" dataKey="completed" name="Completed" stroke={C.green} fill="url(#gDone)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
              <Panel title="Open risks by severity">
                <div className="h-[260px] p-3">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={d.riskSeverity} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="none">
                        {d.riskSeverity.map((s) => <Cell key={s.name} fill={s.name === "High" ? C.red : s.name === "Medium" ? C.amber : C.grey} />)}
                      </Pie>
                      <Tooltip {...tooltip} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Workload by person">
                {d.workload.length ? (
                  <div className="h-[300px] p-3">
                    <ResponsiveContainer>
                      <BarChart data={d.workload} layout="vertical" margin={{ left: 10, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={axis} axisLine={false} tickLine={false} width={70} />
                        <Tooltip {...tooltip} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="open" name="Open" stackId="a" fill={C.grey} />
                        <Bar dataKey="inProgress" name="In progress" stackId="a" fill={C.blue} />
                        <Bar dataKey="completed" name="Completed" stackId="a" fill={C.green} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState compact title="No assigned tasks yet" />
                )}
              </Panel>

              <Panel title="Departments">
                {d.departments.length ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Department</th>
                        <th className="text-right">Open</th>
                        <th className="text-right">Overdue</th>
                        <th className="w-[38%]">Completion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.departments.map((dp) => (
                        <tr key={dp.name}>
                          <td className="font-medium">{dp.name}</td>
                          <td className="text-right tabular-nums">{dp.openTasks}</td>
                          <td className="text-right tabular-nums">{dp.overdueTasks > 0 ? <span className="text-red-600 dark:text-red-400">{dp.overdueTasks}</span> : 0}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <ProgressBar value={dp.completionRate} tone="green" />
                              <span className="w-10 text-right text-2xs tabular-nums text-muted">{pct(dp.completionRate)}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyState compact title="No department data yet" />
                )}
              </Panel>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
              <Panel title="Extracted items per meeting">
                <div className="h-[260px] p-3">
                  <ResponsiveContainer>
                    <BarChart data={d.itemsPerMeeting} margin={{ left: -20, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
                      <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
                      <Tooltip {...tooltip} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="tasks" name="Tasks" fill={C.blue} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="decisions" name="Decisions" fill={C.green} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="risks" name="Risks" fill={C.amber} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
              <Panel title="Recurring risks" icon={<Repeat className="h-4 w-4 text-violet-500" />} actions={<Link to="/risks?recurring=1" className="btn-ghost btn-sm">All</Link>}>
                {d.recurringRisks.length ? (
                  <div className="divide-y divide-line">
                    {d.recurringRisks.map((r) => (
                      <Link key={r.id} to={`/risks?highlight=${r.id}`} className="block px-4 py-2.5 hover:bg-hover/50">
                        <div className="text-[13px]">{r.description}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-2xs text-faint">
                          <Badge tone={r.severity === "High" ? "red" : r.severity === "Medium" ? "amber" : "neutral"}>{r.severity}</Badge>
                          {r.meetingTitle}
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyState compact title="No recurring risks" message="A risk is flagged when it is raised again in a later meeting." />
                )}
              </Panel>
            </div>
          </div>
        )}
      </QueryView>
    </div>
  );
}
