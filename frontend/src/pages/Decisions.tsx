import { useState } from "react";
import { Link } from "react-router-dom";
import { Gavel, Search, Quote } from "lucide-react";
import { decisions, personById, meetingById } from "../data/mockData";
import { Avatar, PageHeader, formatDate } from "../components/ui";

export default function Decisions() {
  const [query, setQuery] = useState("");
  const filtered = decisions.filter((d) =>
    d.statement.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="Decision Register"
        subtitle="Every decision made across meetings, with owner and evidence."
      />

      <div className="mb-4 relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Search decisions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {filtered.map((d) => {
          const owner = personById(d.ownerId);
          const meeting = meetingById(d.meetingId);
          return (
            <div key={d.id} className="card p-5">
              <div className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <Gavel className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-slate-800">
                    {d.statement}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar
                        initials={owner.initials}
                        className="h-5 w-5 text-[10px]"
                      />
                      {owner.name}
                    </span>
                    <span>{formatDate(d.decidedAt)}</span>
                    {meeting && (
                      <Link
                        to={`/meetings/${meeting.id}`}
                        className="text-brand-600 hover:underline"
                      >
                        {meeting.title}
                      </Link>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2 rounded-lg border-l-2 border-emerald-300 bg-emerald-50/40 px-3 py-2">
                    <Quote className="h-4 w-4 shrink-0 text-emerald-400" />
                    <div className="text-xs text-slate-500">
                      <span className="italic">"{d.evidence.quote}"</span>
                      <span className="ml-1 font-medium text-slate-400">
                        — {d.evidence.speaker}, {d.evidence.timestamp}
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
