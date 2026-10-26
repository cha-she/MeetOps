import { useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, Repeat, Search } from "lucide-react";
import { api } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import {
  Badge,
  EmptyState,
  EvidenceBlock,
  PageHeader,
  QueryView,
  formatDate,
  severityStyles,
} from "../components/ui";
import type { RiskSeverity } from "../types";

const severityOptions: (RiskSeverity | "All")[] = ["All", "High", "Medium", "Low"];
const severityRank: Record<RiskSeverity, number> = { High: 0, Medium: 1, Low: 2 };

export default function Risks() {
  const [filter, setFilter] = useState<RiskSeverity | "All">("All");
  const [query, setQuery] = useState("");
  const risks = useQuery("risks", () => api.listRisks());

  const q = query.trim().toLowerCase();

  return (
    <div>
      <PageHeader
        title="Risk Log"
        subtitle="Risks raised in meetings, ranked by severity, with recurring-issue flags."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
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
        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search risks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <QueryView
        {...risks}
        onRetry={risks.reload}
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            title="No risks yet"
            message="Risks appear here automatically once a meeting has been processed."
            action={<Link to="/upload" className="btn-primary">Upload a meeting</Link>}
          />
        }
      >
        {(all) => {
          const list = all
            .filter((r) => filter === "All" || r.severity === filter)
            .filter(
              (r) =>
                !q ||
                r.description.toLowerCase().includes(q) ||
                r.meetingTitle.toLowerCase().includes(q)
            )
            .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
          if (list.length === 0) {
            return <EmptyState title="No matches" message="No risk matches the current filters." />;
          }
          return (
            <div className="space-y-3">
              {list.map((r) => (
                <div key={r.id} className="card p-5">
                  <div className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                      <ShieldAlert className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold text-slate-800">{r.description}</div>
                        <div className="flex shrink-0 items-center gap-2">
                          {r.recurring && (
                            <Badge className="bg-purple-50 text-purple-700 ring-purple-200">
                              <Repeat className="h-3 w-3" />
                              Recurring
                            </Badge>
                          )}
                          <Badge className={severityStyles[r.severity]}>{r.severity}</Badge>
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                        <span>Raised {formatDate(r.raisedAt)}</span>
                        <Link to={`/meetings/${r.meetingId}`} className="text-brand-600 hover:underline">
                          {r.meetingTitle}
                        </Link>
                      </div>
                      <EvidenceBlock evidence={r.evidence} meetingId={r.meetingId} tone="amber" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
