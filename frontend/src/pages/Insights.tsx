import { Link } from "react-router-dom";
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
import { Repeat } from "lucide-react";
import { api } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { Badge, EmptyState, PageHeader, QueryView, Skeleton } from "../components/ui";

const tooltipStyle = { borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 };
const severityColors: Record<string, string> = { High: "#ef4444", Medium: "#f59e0b", Low: "#94a3b8" };

export default function Insights() {
  const insights = useQuery("insights", () => api.insights());
  const animate = !useReducedMotion();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        subtitle="Cross-meeting analytics: workload, category mix, and recurring risks."
      />

      <QueryView
        {...insights}
        onRetry={insights.reload}
        skeleton={
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card p-5">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="mt-4 h-48 w-full" />
              </div>
            ))}
          </div>
        }
        isEmpty={(d) => d.totals.meetings === 0}
        empty={
          <EmptyState
            title="No analytics yet"
            message="Insights are calculated from processed meetings. Upload one to get started."
            action={<Link to="/upload" className="btn-primary">Upload a meeting</Link>}
          />
        }
      >
        {(d) => {
          const categoryData = [
            { name: "Tasks", value: d.totals.tasks, color: "#3b82f6" },
            { name: "Decisions", value: d.totals.decisions, color: "#10b981" },
            { name: "Risks", value: d.totals.risks, color: "#f59e0b" },
          ];
          return (
            <>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="card p-5">
                  <h3 className="mb-4 font-semibold text-slate-800">Extracted item mix</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3} isAnimationActive={animate}>
                        {categoryData.map((c) => (
                          <Cell key={c.name} fill={c.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="card p-5">
                  <h3 className="mb-4 font-semibold text-slate-800">Risk severity</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={d.riskSeverity} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3} isAnimationActive={animate}>
                        {d.riskSeverity.map((s) => (
                          <Cell key={s.name} fill={severityColors[s.name] ?? "#cbd5e1"} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="card p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Repeat className="h-4 w-4 text-purple-500" />
                    <h3 className="font-semibold text-slate-800">Recurring risks</h3>
                  </div>
                  <div className="space-y-3">
                    {d.recurringRisks.map((r) => (
                      <Link
                        key={r.id}
                        to={`/meetings/${r.meetingId}`}
                        className="block rounded-lg border border-purple-100 bg-purple-50/50 p-3 transition hover:bg-purple-50"
                      >
                        <div className="text-sm font-medium text-slate-700">{r.description}</div>
                        <div className="mt-1">
                          <Badge className="bg-purple-50 text-purple-700 ring-purple-200">
                            Seen in multiple meetings
                          </Badge>
                        </div>
                      </Link>
                    ))}
                    {d.recurringRisks.length === 0 && (
                      <div className="text-sm text-slate-400">No recurring risks detected.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="card p-5">
                <h3 className="mb-4 font-semibold text-slate-800">Task workload by owner</h3>
                {d.workload.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-400">No tasks assigned yet.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={d.workload} barCategoryGap="28%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="open" name="Open" stackId="a" fill="#94a3b8" isAnimationActive={animate} />
                      <Bar dataKey="inProgress" name="In Progress" stackId="a" fill="#3b82f6" isAnimationActive={animate} />
                      <Bar dataKey="completed" name="Completed" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={animate} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: "Meetings analysed", value: String(d.totals.processedMeetings) },
                  { label: "Avg items / meeting", value: d.avgItemsPerMeeting.toFixed(1) },
                  { label: "Task completion rate", value: `${Math.round(d.completionRate)}%` },
                  { label: "Most assigned owner", value: d.topOwner ?? "—" },
                ].map((s) => (
                  <div key={s.label} className="card p-4">
                    <div className="truncate text-2xl font-extrabold text-slate-900">{s.value}</div>
                    <div className="mt-1 text-xs text-slate-400">{s.label}</div>
                  </div>
                ))}
              </div>
            </>
          );
        }}
      </QueryView>
    </div>
  );
}
