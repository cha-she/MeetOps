import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, FileAudio, FileText, FileVideo, Loader2, Upload } from "lucide-react";
import { api, type MeetingFilters } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import { useUsers } from "../components/items";
import { AvatarStack, Badge, DateRange, EmptyState, FilterSelect, PageHeader, QueryView, RowsSkeleton, SearchInput, formatDate, formatDuration } from "../components/ui";
import { LIST_REFRESH_INTERVAL_MS } from "../config";
import type { MeetingSource } from "../types";

const sourceIcon: Record<MeetingSource, JSX.Element> = {
  transcript: <FileText className="h-3.5 w-3.5" />,
  audio: <FileAudio className="h-3.5 w-3.5" />,
  video: <FileVideo className="h-3.5 w-3.5" />,
};

export default function Meetings() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };
  const [q, setQ] = useState(get("q"));
  useEffect(() => {
    const t = window.setTimeout(() => q !== (params.get("q") ?? "") && set({ q }), 250);
    return () => window.clearTimeout(t);
  });

  const filters: MeetingFilters = {
    q: get("q") || undefined,
    departmentId: get("dept") ? Number(get("dept")) : undefined,
    participantId: get("person") ? Number(get("person")) : undefined,
    from: get("from") || undefined,
    to: get("to") || undefined,
  };
  const meetings = useQuery(`meetings:${JSON.stringify(filters)}`, () => api.listMeetings(filters), { refreshMs: LIST_REFRESH_INTERVAL_MS });
  const depts = useQuery("departments", () => api.listDepartments());
  const users = useUsers();
  const active = ["q", "dept", "person", "from", "to"].some((k) => params.get(k));

  return (
    <div>
      <PageHeader
        icon={<CalendarDays className="h-5 w-5 text-faint" />}
        title="Meetings"
        description="Every processed meeting with what was extracted from it."
        actions={
          <Link to="/upload" className="btn-primary">
            <Upload className="h-4 w-4" /> Upload meeting
          </Link>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search meetings…" className="w-full sm:w-56" />
        <FilterSelect label="Department" value={get("dept")} onChange={(v) => set({ dept: v })} options={(depts.data ?? []).map((d) => ({ value: String(d.id), label: d.name }))} />
        <FilterSelect label="Participant" value={get("person")} onChange={(v) => set({ person: v })} options={(users.data ?? []).map((u) => ({ value: String(u.id), label: u.name }))} />
        <DateRange label="Date" from={get("from")} to={get("to")} onChange={(f, t) => set({ from: f, to: t })} />
        {active && <button className="btn-ghost" onClick={() => { setQ(""); setParams({}, { replace: true }); }}>Clear</button>}
      </div>

      <QueryView
        {...meetings}
        onRetry={meetings.reload}
        skeleton={<div className="panel"><RowsSkeleton rows={6} /></div>}
        isEmpty={(d) => d.length === 0}
        empty={
          <div className="panel">
            <EmptyState
              icon={<CalendarDays className="h-5 w-5" />}
              title={active ? "No meetings match" : "No meetings yet"}
              message={active ? "Try clearing a filter." : "Upload a transcript to create the first meeting."}
              action={!active && <Link to="/upload" className="btn-primary">Upload meeting</Link>}
            />
          </div>
        }
      >
        {(list) => (
          <div className="panel overflow-x-auto">
            <table className="table min-w-[860px]">
              <thead>
                <tr>
                  <th>Meeting</th>
                  <th>Date</th>
                  <th>Participants</th>
                  <th className="text-right">Tasks</th>
                  <th className="text-right">Decisions</th>
                  <th className="text-right">Risks</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id} className="cursor-pointer" onClick={() => navigate(`/meetings/${m.id}`)}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="text-faint">{sourceIcon[m.source]}</span>
                        <span className="font-medium text-fg">{m.title}</span>
                      </div>
                      <div className="mt-0.5 pl-[22px] text-2xs text-faint">
                        {m.department?.name ?? "No department"}
                        {m.uploadedBy && ` · uploaded by ${m.uploadedBy.name}`}
                        {m.durationMin !== null && ` · ${formatDuration(m.durationMin)}`}
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-muted">{formatDate(m.date, true)}</td>
                    <td>{m.participants.length ? <AvatarStack people={m.participants} /> : <span className="text-faint">—</span>}</td>
                    <td className="text-right tabular-nums">{m.taskCount}</td>
                    <td className="text-right tabular-nums">{m.decisionCount}</td>
                    <td className="text-right tabular-nums">{m.riskCount}</td>
                    <td>
                      {m.status === "Processed" ? (
                        m.suggestedCount > 0 ? <Badge tone="amber">{m.suggestedCount} to review</Badge> : <Badge tone="green">Reviewed</Badge>
                      ) : m.status === "Failed" ? (
                        <Badge tone="red" title={m.errorMessage ?? undefined}>Failed</Badge>
                      ) : (
                        <Badge tone="blue">
                          <Loader2 className="h-3 w-3 animate-spin" /> {m.pipelineStage ?? m.status}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
    </div>
  );
}
