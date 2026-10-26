import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Clock,
  Search,
  FileAudio,
  FileVideo,
  FileText,
  Loader2,
} from "lucide-react";
import { api } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import {
  Avatar,
  Badge,
  EmptyState,
  PageHeader,
  QueryView,
  formatDate,
  formatDuration,
  sourceLabel,
} from "../components/ui";
import type { Meeting, MeetingSource } from "../types";

const sourceIcon: Record<MeetingSource, typeof FileAudio> = {
  audio: FileAudio,
  video: FileVideo,
  transcript: FileText,
};

function StatusBadge({ m }: { m: Meeting }) {
  switch (m.status) {
    case "Processed":
      return <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">Processed</Badge>;
    case "Failed":
      return <Badge className="bg-red-50 text-red-700 ring-red-200">Failed</Badge>;
    default:
      return (
        <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
          <Loader2 className="h-3 w-3 animate-spin" /> Processing
        </Badge>
      );
  }
}

export default function Meetings() {
  const [query, setQuery] = useState("");
  const meetings = useQuery("meetings", () => api.listMeetings());

  const q = query.trim().toLowerCase();
  const filter = (list: Meeting[]) =>
    q ? list.filter((m) => m.title.toLowerCase().includes(q)) : list;

  return (
    <div>
      <PageHeader
        title="Meetings"
        subtitle={
          meetings.data ? `${meetings.data.length} meetings ingested` : "All ingested meetings"
        }
        actions={
          <Link to="/upload" className="btn-primary">
            Upload meeting
          </Link>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Filter meetings by title…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <QueryView
        {...meetings}
        onRetry={meetings.reload}
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            title="No meetings yet"
            message="Upload an audio, video, or transcript file and MeetOps will extract its tasks, decisions, and risks."
            action={<Link to="/upload" className="btn-primary">Upload your first meeting</Link>}
          />
        }
      >
        {(all) => {
          const list = filter(all);
          if (list.length === 0) {
            return <EmptyState title="No matches" message={`No meeting title contains "${query}".`} />;
          }
          return (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {list.map((m) => {
                const Icon = sourceIcon[m.source] ?? FileText;
                return (
                  <Link key={m.id} to={`/meetings/${m.id}`} className="card card-hover block p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-800">{m.title}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="h-3.5 w-3.5" />
                              {formatDate(m.date)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {formatDuration(m.durationMin)}
                            </span>
                            <span>{sourceLabel[m.source]}</span>
                          </div>
                        </div>
                      </div>
                      <StatusBadge m={m} />
                    </div>

                    {m.summary && m.status === "Processed" && (
                      <p className="mt-3 line-clamp-2 text-sm text-slate-500">{m.summary}</p>
                    )}
                    {m.status === "Failed" && m.errorMessage && (
                      <p className="mt-3 line-clamp-2 text-sm text-red-600">{m.errorMessage}</p>
                    )}

                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex -space-x-2">
                        {m.participants.slice(0, 4).map((p) => (
                          <Avatar key={p.id} initials={p.initials} title={p.name} className="ring-2 ring-white" />
                        ))}
                        {m.participants.length > 4 && (
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500 ring-2 ring-white">
                            +{m.participants.length - 4}
                          </span>
                        )}
                        {m.participants.length === 0 && (
                          <span className="text-xs text-slate-400">No participants recorded</span>
                        )}
                      </div>
                      {m.status === "Processed" && (
                        <div className="flex items-center gap-2">
                          <Badge className="bg-blue-50 text-blue-700 ring-blue-200">{m.taskCount} tasks</Badge>
                          <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">{m.decisionCount} decisions</Badge>
                          <Badge className="bg-amber-50 text-amber-700 ring-amber-200">{m.riskCount} risks</Badge>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
