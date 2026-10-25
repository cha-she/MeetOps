import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Clock, Search, FileAudio, FileVideo, FileText } from "lucide-react";
import { meetings, people } from "../data/mockData";
import { Avatar, Badge, PageHeader, formatDate, sourceLabel } from "../components/ui";
import type { MeetingSource } from "../types";

const sourceIcon: Record<MeetingSource, typeof FileAudio> = {
  audio: FileAudio,
  video: FileVideo,
  transcript: FileText,
};

export default function Meetings() {
  const [query, setQuery] = useState("");

  const filtered = meetings.filter((m) =>
    m.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="Meetings"
        subtitle={`${meetings.length} meetings ingested`}
        actions={
          <Link to="/upload" className="btn-primary">
            Upload meeting
          </Link>
        }
      />

      <div className="mb-4 relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Search meetings…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {filtered.map((m) => {
          const Icon = sourceIcon[m.source];
          const participants = people.filter((p) =>
            m.participants.includes(p.id)
          );
          const processing = m.status === "Processing";
          return (
            <Link
              key={m.id}
              to={processing ? "#" : `/meetings/${m.id}`}
              className={`card block p-5 ${
                processing ? "cursor-default opacity-80" : "card-hover"
              }`}
              onClick={(e) => processing && e.preventDefault()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">{m.title}</div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDate(m.date)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {m.durationMin} min
                      </span>
                      <span>{sourceLabel[m.source]}</span>
                    </div>
                  </div>
                </div>
                {processing ? (
                  <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
                    Processing…
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                    Processed
                  </Badge>
                )}
              </div>

              {!processing && (
                <p className="mt-3 line-clamp-2 text-sm text-slate-500">
                  {m.summary}
                </p>
              )}

              <div className="mt-4 flex items-center justify-between">
                <div className="flex -space-x-2">
                  {participants.slice(0, 4).map((p) => (
                    <Avatar
                      key={p.id}
                      initials={p.initials}
                      className="ring-2 ring-white"
                    />
                  ))}
                  {participants.length > 4 && (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500 ring-2 ring-white">
                      +{participants.length - 4}
                    </span>
                  )}
                </div>
                {!processing && (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-50 text-blue-700 ring-blue-200">
                      {m.taskCount} tasks
                    </Badge>
                    <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                      {m.decisionCount} decisions
                    </Badge>
                    <Badge className="bg-amber-50 text-amber-700 ring-amber-200">
                      {m.riskCount} risks
                    </Badge>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
