import { useState } from "react";
import { Link } from "react-router-dom";
import { Gavel, Search } from "lucide-react";
import { api } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import {
  Avatar,
  EmptyState,
  EvidenceBlock,
  PageHeader,
  QueryView,
  formatDate,
} from "../components/ui";

export default function Decisions() {
  const [query, setQuery] = useState("");
  const decisions = useQuery("decisions", () => api.listDecisions());

  const q = query.trim().toLowerCase();

  return (
    <div>
      <PageHeader
        title="Decision Register"
        subtitle="Every decision made across meetings, with owner and evidence."
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Search decisions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <QueryView
        {...decisions}
        onRetry={decisions.reload}
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            title="No decisions yet"
            message="Decisions appear here automatically once a meeting has been processed."
            action={<Link to="/upload" className="btn-primary">Upload a meeting</Link>}
          />
        }
      >
        {(all) => {
          const list = q
            ? all.filter(
                (d) =>
                  d.statement.toLowerCase().includes(q) ||
                  d.owner?.name.toLowerCase().includes(q) ||
                  d.meetingTitle.toLowerCase().includes(q)
              )
            : all;
          if (list.length === 0) {
            return <EmptyState title="No matches" message={`No decision matches "${query}".`} />;
          }
          return (
            <div className="space-y-3">
              {list.map((d) => (
                <div key={d.id} className="card p-5">
                  <div className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <Gavel className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-slate-800">{d.statement}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <Avatar initials={d.owner?.initials ?? "?"} className="h-5 w-5 text-[10px]" />
                          {d.owner?.name ?? "Owner not identified"}
                        </span>
                        <span>{formatDate(d.decidedAt)}</span>
                        <Link to={`/meetings/${d.meetingId}`} className="text-brand-600 hover:underline">
                          {d.meetingTitle}
                        </Link>
                      </div>
                      <EvidenceBlock evidence={d.evidence} meetingId={d.meetingId} tone="emerald" />
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
