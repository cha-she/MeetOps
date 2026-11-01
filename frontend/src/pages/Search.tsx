import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, Gavel, ListChecks, Search as SearchIcon, ShieldAlert } from "lucide-react";
import { api } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import { CategoryChip, SeverityBadge, UserChip } from "../components/items";
import { EmptyState, PageHeader, Panel, QueryView, RowsSkeleton, formatDate } from "../components/ui";

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const results = useQuery(`search:${q}`, () => api.search(q), { enabled: q.length > 0 });

  if (!q) return <div className="panel"><EmptyState icon={<SearchIcon className="h-5 w-5" />} title="Search MeetOps" message="Press Ctrl K anywhere to search meetings, tasks, decisions, risks and transcripts." /></div>;

  return (
    <div>
      <PageHeader icon={<SearchIcon className="h-5 w-5 text-faint" />} title={`Results for “${q}”`} />
      <QueryView
        {...results}
        onRetry={results.reload}
        skeleton={<div className="panel"><RowsSkeleton rows={6} /></div>}
        isEmpty={(r) => !r.meetings.length && !r.tasks.length && !r.decisions.length && !r.risks.length}
        empty={<div className="panel"><EmptyState title="No results" message="Search looks in titles, summaries, extracted items and the transcript lines behind them." /></div>}
      >
        {(r) => (
          <div className="space-y-5">
            {r.tasks.length > 0 && (
              <Panel title={`Tasks · ${r.tasks.length}`} icon={<ListChecks className="h-4 w-4 text-blue-500" />}>
                <div className="divide-y divide-line">
                  {r.tasks.map((t) => (
                    <Link key={t.id} to={`/tasks?task=${t.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover/50">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{t.description}</span>
                      <UserChip user={t.owner} name={t.ownerName} />
                      <span className="w-40 truncate text-2xs text-faint">{t.meetingTitle}</span>
                    </Link>
                  ))}
                </div>
              </Panel>
            )}
            {r.decisions.length > 0 && (
              <Panel title={`Decisions · ${r.decisions.length}`} icon={<Gavel className="h-4 w-4 text-emerald-500" />}>
                <div className="divide-y divide-line">
                  {r.decisions.map((d) => (
                    <Link key={d.id} to={`/decisions?highlight=${d.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover/50">
                      <CategoryChip category="Decision" />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{d.statement}</span>
                      <span className="text-2xs text-faint">{formatDate(d.decidedAt)}</span>
                    </Link>
                  ))}
                </div>
              </Panel>
            )}
            {r.risks.length > 0 && (
              <Panel title={`Risks · ${r.risks.length}`} icon={<ShieldAlert className="h-4 w-4 text-amber-500" />}>
                <div className="divide-y divide-line">
                  {r.risks.map((x) => (
                    <Link key={x.id} to={`/risks?highlight=${x.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover/50">
                      <SeverityBadge severity={x.severity} />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{x.description}</span>
                      <span className="w-40 truncate text-2xs text-faint">{x.meetingTitle}</span>
                    </Link>
                  ))}
                </div>
              </Panel>
            )}
            {r.meetings.length > 0 && (
              <Panel title={`Meetings · ${r.meetings.length}`} icon={<CalendarDays className="h-4 w-4 text-faint" />}>
                <div className="divide-y divide-line">
                  {r.meetings.map((m) => (
                    <Link key={m.id} to={`/meetings/${m.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover/50">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{m.title}</span>
                      <span className="text-2xs text-faint">{formatDate(m.date, true)}</span>
                    </Link>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        )}
      </QueryView>
    </div>
  );
}
