import { useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, Quote, Repeat } from "lucide-react";
import { risks, meetingById } from "../data/mockData";
import { Badge, PageHeader, formatDate, severityStyles } from "../components/ui";
import type { RiskSeverity } from "../types";

const severityOptions: (RiskSeverity | "All")[] = ["All", "High", "Medium", "Low"];

export default function Risks() {
  const [filter, setFilter] = useState<RiskSeverity | "All">("All");
  const filtered = risks.filter((r) => filter === "All" || r.severity === filter);

  return (
    <div>
      <PageHeader
        title="Risk Log"
        subtitle="Risks raised in meetings, ranked by severity, with recurring-issue flags."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {severityOptions.map((s) => (
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
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((r) => {
          const meeting = meetingById(r.meetingId);
          return (
            <div key={r.id} className="card p-5">
              <div className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-semibold text-slate-800">
                      {r.description}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {r.recurring && (
                        <Badge className="bg-purple-50 text-purple-700 ring-purple-200">
                          <Repeat className="h-3 w-3" />
                          Recurring
                        </Badge>
                      )}
                      <Badge className={severityStyles[r.severity]}>
                        {r.severity}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                    <span>Raised {formatDate(r.raisedAt)}</span>
                    {meeting && (
                      <Link
                        to={`/meetings/${meeting.id}`}
                        className="text-brand-600 hover:underline"
                      >
                        {meeting.title}
                      </Link>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2 rounded-lg border-l-2 border-amber-300 bg-amber-50/40 px-3 py-2">
                    <Quote className="h-4 w-4 shrink-0 text-amber-400" />
                    <div className="text-xs text-slate-500">
                      <span className="italic">"{r.evidence.quote}"</span>
                      <span className="ml-1 font-medium text-slate-400">
                        — {r.evidence.speaker}, {r.evidence.timestamp}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
