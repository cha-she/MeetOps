import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCheck, Gavel, Inbox, ListChecks, ShieldAlert, Sparkles } from "lucide-react";
import { api } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import { CategoryChip, ConfidenceMeter, DueDate, EvidenceQuote, ReviewButtons, SeverityBadge, UserChip } from "../components/items";
import { TASK_REFRESH } from "../components/tasks";
import { EmptyState, PageHeader, Panel, QueryView, RowsSkeleton, formatDate } from "../components/ui";
import { useMutation } from "../hooks/useMutation";
import type { Decision, ReviewQueue, Risk, Task } from "../types";

type Item = { kind: "Task"; item: Task } | { kind: "Decision"; item: Decision } | { kind: "Risk"; item: Risk };

function text(i: Item) {
  return i.kind === "Task" ? i.item.description : i.kind === "Decision" ? i.item.statement : i.item.description;
}

// Everything the system extracted but was not confident about, grouped by meeting.
// One click confirms or rejects; rejections are stored as training feedback.
export default function Review() {
  const [params, setParams] = useSearchParams();
  const meetingFilter = params.get("meeting");
  const queue = useQuery(`review:${meetingFilter ?? "all"}`, () => api.reviewQueue({ meetingId: meetingFilter ? Number(meetingFilter) : undefined }), { refreshMs: 20000 });
  const { run, busy } = useMutation();

  const groups = useMemo(() => {
    const q: ReviewQueue = queue.data ?? { tasks: [], decisions: [], risks: [] };
    const all: Item[] = [
      ...q.tasks.map((item) => ({ kind: "Task" as const, item })),
      ...q.decisions.map((item) => ({ kind: "Decision" as const, item })),
      ...q.risks.map((item) => ({ kind: "Risk" as const, item })),
    ];
    const map = new Map<number, { title: string; items: Item[] }>();
    for (const i of all) {
      const g = map.get(i.item.meetingId) ?? { title: i.item.meetingTitle, items: [] };
      g.items.push(i);
      map.set(i.item.meetingId, g);
    }
    for (const g of map.values()) g.items.sort((a, b) => (a.item.evidence?.segmentId ?? 0) - (b.item.evidence?.segmentId ?? 0));
    return [...map.entries()].sort(([a], [b]) => b - a);
  }, [queue.data]);

  const total = groups.reduce((n, [, g]) => n + g.items.length, 0);

  function decide(i: Item, status: "confirmed" | "rejected") {
    const call = async (): Promise<unknown> =>
      i.kind === "Task" ? api.updateTask(i.item.id, { reviewStatus: status })
      : i.kind === "Decision" ? api.updateDecision(i.item.id, { reviewStatus: status })
      : api.updateRisk(i.item.id, { reviewStatus: status });
    const undo =
      i.kind === "Task" ? () => api.updateTask(i.item.id, { reviewStatus: "suggested" })
      : i.kind === "Decision" ? () => api.updateDecision(i.item.id, { reviewStatus: "suggested" })
      : () => api.updateRisk(i.item.id, { reviewStatus: "suggested" });
    return run(call, { success: `${i.kind} ${status}`, refresh: [...TASK_REFRESH, "decisions", "risks"], undo });
  }

  async function confirmAll(items: Item[]) {
    await run(
      async () => {
        for (const i of items) {
          if (i.kind === "Task") await api.updateTask(i.item.id, { reviewStatus: "confirmed" });
          else if (i.kind === "Decision") await api.updateDecision(i.item.id, { reviewStatus: "confirmed" });
          else await api.updateRisk(i.item.id, { reviewStatus: "confirmed" });
        }
      },
      { success: `${items.length} items confirmed`, refresh: [...TASK_REFRESH, "decisions", "risks"] }
    );
  }

  return (
    <div>
      <PageHeader
        icon={<Inbox className="h-5 w-5 text-faint" />}
        title="Review"
        description="Items the model was not sure about, or that a rule changed. Confirm what is right and reject what is not; corrections are saved to retrain the model."
        actions={meetingFilter && <button className="btn-secondary" onClick={() => setParams({})}>Show all meetings</button>}
      />

      <QueryView
        {...queue}
        onRetry={queue.reload}
        skeleton={<div className="panel"><RowsSkeleton rows={6} /></div>}
        isEmpty={() => total === 0}
        empty={<div className="panel"><EmptyState icon={<CheckCheck className="h-5 w-5 text-emerald-500" />} title="Inbox zero" message="Everything extracted from your meetings has been reviewed." /></div>}
      >
        {() => (
          <div className="space-y-5">
            {groups.map(([meetingId, g]) => (
              <Panel
                key={meetingId}
                title={<Link to={`/meetings/${meetingId}`} className="hover:text-accent-text">{g.title}</Link>}
                icon={<Sparkles className="h-4 w-4 text-amber-500" />}
                actions={
                  <button className="btn-secondary btn-sm" disabled={busy} onClick={() => confirmAll(g.items)}>
                    <CheckCheck className="h-3.5 w-3.5" /> Confirm all {g.items.length}
                  </button>
                }
              >
                <div className="divide-y divide-line">
                  {g.items.map((i) => (
                    <div key={`${i.kind}${i.item.id}`} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
                      <div className="flex w-24 shrink-0 items-center gap-1.5">
                        {i.kind === "Task" ? <ListChecks className="h-3.5 w-3.5 text-blue-500" /> : i.kind === "Decision" ? <Gavel className="h-3.5 w-3.5 text-emerald-500" /> : <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />}
                        <CategoryChip category={i.kind} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium">{text(i)}</div>
                        <EvidenceQuote evidence={i.item.evidence} meetingId={i.item.meetingId} className="mt-0.5" />
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-muted">
                          {i.kind === "Task" && (
                            <>
                              <UserChip user={i.item.owner} name={i.item.ownerName} />
                              <DueDate deadline={i.item.deadline} text={i.item.deadlineText} status={i.item.status} />
                            </>
                          )}
                          {i.kind === "Decision" && <span>Decided {formatDate(i.item.decidedAt)}</span>}
                          {i.kind === "Risk" && <SeverityBadge severity={i.item.severity} />}
                          <ConfidenceMeter value={i.item.confidence} source={i.item.source} />
                        </div>
                      </div>
                      <ReviewButtons busy={busy} onConfirm={() => decide(i, "confirmed")} onReject={() => decide(i, "rejected")} />
                    </div>
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}
