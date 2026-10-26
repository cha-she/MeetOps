import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, Gavel, ListChecks, ShieldAlert } from "lucide-react";
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
  statusStyles,
} from "../components/ui";

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const results = useQuery(`search:${q}`, () =>
    q ? api.search(q) : Promise.resolve({ query: "", meetings: [], tasks: [], decisions: [], risks: [] })
  );

  if (!q) {
    return (
      <EmptyState
        title="Search MeetOps"
        message="Type in the search box at the top to find tasks, decisions, risks, and meetings."
      />
    );
  }

  return (
    <div>
      <PageHeader title={`Results for “${q}”`} subtitle="Matches across meetings, tasks, decisions, and risks." />

      <QueryView
        {...results}
        onRetry={results.reload}
        isEmpty={(d) =>
          d.meetings.length + d.tasks.length + d.decisions.length + d.risks.length === 0
        }
        empty={<EmptyState title="No results" message={`Nothing matched “${q}”. Try a different word.`} />}
      >
        {(d) => (
          <div className="space-y-8">
            {d.meetings.length > 0 && (
              <Section icon={CalendarDays} title="Meetings" count={d.meetings.length}>
                {d.meetings.map((m) => (
                  <Link key={m.id} to={`/meetings/${m.id}`} className="card card-hover block p-4">
                    <div className="font-semibold text-slate-800">{m.title}</div>
                    <div className="mt-1 text-xs text-slate-400">{formatDate(m.date)}</div>
                  </Link>
                ))}
              </Section>
            )}

            {d.tasks.length > 0 && (
              <Section icon={ListChecks} title="Tasks" count={d.tasks.length}>
                {d.tasks.map((t) => (
                  <div key={t.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium text-slate-800">{t.description}</div>
                      <Badge className={statusStyles[t.status]}>{t.status}</Badge>
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {t.owner?.name ?? "Unassigned"} · Due {formatDate(t.deadline)} ·{" "}
                      <Link to={`/meetings/${t.meetingId}`} className="text-brand-600 hover:underline">
                        {t.meetingTitle}
                      </Link>
                    </div>
                    <EvidenceBlock evidence={t.evidence} meetingId={t.meetingId} />
                  </div>
                ))}
              </Section>
            )}

            {d.decisions.length > 0 && (
              <Section icon={Gavel} title="Decisions" count={d.decisions.length}>
                {d.decisions.map((dec) => (
                  <div key={dec.id} className="card p-4">
                    <div className="font-medium text-slate-800">{dec.statement}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {dec.owner?.name ?? "Owner not identified"} · {formatDate(dec.decidedAt)} ·{" "}
                      <Link to={`/meetings/${dec.meetingId}`} className="text-brand-600 hover:underline">
                        {dec.meetingTitle}
                      </Link>
                    </div>
                    <EvidenceBlock evidence={dec.evidence} meetingId={dec.meetingId} tone="emerald" />
                  </div>
                ))}
              </Section>
            )}

            {d.risks.length > 0 && (
              <Section icon={ShieldAlert} title="Risks" count={d.risks.length}>
                {d.risks.map((r) => (
                  <div key={r.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium text-slate-800">{r.description}</div>
                      <Badge className={severityStyles[r.severity]}>{r.severity}</Badge>
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      Raised {formatDate(r.raisedAt)} ·{" "}
                      <Link to={`/meetings/${r.meetingId}`} className="text-brand-600 hover:underline">
                        {r.meetingTitle}
                      </Link>
                    </div>
                    <EvidenceBlock evidence={r.evidence} meetingId={r.meetingId} tone="amber" />
                  </div>
                ))}
              </Section>
            )}
          </div>
        )}
      </QueryView>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: typeof ListChecks;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <h2 className="font-semibold text-slate-800">{title}</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
