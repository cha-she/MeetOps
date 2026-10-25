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
import { tasks, decisions, risks, people, personById } from "../data/mockData";
import { Badge, PageHeader } from "../components/ui";

// Category distribution across all extracted records.
const categoryData = [
  { name: "Tasks", value: tasks.length, color: "#3b82f6" },
  { name: "Decisions", value: decisions.length, color: "#10b981" },
  { name: "Risks", value: risks.length, color: "#f59e0b" },
];

// Task workload per owner.
const workload = people
  .map((p) => ({
    name: p.name.split(" ")[0],
    Open: tasks.filter((t) => t.ownerId === p.id && t.status === "Open").length,
    "In Progress": tasks.filter(
      (t) => t.ownerId === p.id && t.status === "In Progress"
    ).length,
    Completed: tasks.filter(
      (t) => t.ownerId === p.id && t.status === "Completed"
    ).length,
  }))
  .filter((w) => w.Open + w["In Progress"] + w.Completed > 0);

const severityData = [
  { name: "High", value: risks.filter((r) => r.severity === "High").length, color: "#ef4444" },
  { name: "Medium", value: risks.filter((r) => r.severity === "Medium").length, color: "#f59e0b" },
  { name: "Low", value: risks.filter((r) => r.severity === "Low").length, color: "#94a3b8" },
];

const recurring = risks.filter((r) => r.recurring);

export default function Insights() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        subtitle="Cross-meeting analytics: workload, category mix, and recurring risks."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-5">
          <h3 className="mb-4 font-semibold text-slate-800">
            Extracted item mix
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={categoryData}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
              >
                {categoryData.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 font-semibold text-slate-800">Risk severity</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={severityData}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
              >
                {severityData.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
              />
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
            {recurring.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-purple-100 bg-purple-50/50 p-3"
              >
                <div className="text-sm font-medium text-slate-700">
                  {r.description}
                </div>
                <div className="mt-1">
                  <Badge className="bg-purple-50 text-purple-700 ring-purple-200">
                    Seen in multiple meetings
                  </Badge>
                </div>
              </div>
            ))}
            {recurring.length === 0 && (
              <div className="text-sm text-slate-400">
                No recurring risks detected.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="mb-4 font-semibold text-slate-800">
          Task workload by owner
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={workload} barCategoryGap="28%">
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
              contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Open" stackId="a" fill="#94a3b8" radius={[0, 0, 0, 0]} />
            <Bar dataKey="In Progress" stackId="a" fill="#3b82f6" />
            <Bar dataKey="Completed" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total meetings analysed", value: "4" },
          { label: "Avg items / meeting", value: "9.5" },
          {
            label: "Completion rate",
            value: `${Math.round(
              (tasks.filter((t) => t.status === "Completed").length /
                tasks.length) *
                100
            )}%`,
          },
          {
            label: "Top task owner",
            value: personById("p3").name.split(" ")[0],
          },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <div className="text-2xl font-extrabold text-slate-900">
              {s.value}
            </div>
            <div className="mt-1 text-xs text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
