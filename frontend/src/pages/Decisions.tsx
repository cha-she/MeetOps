import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, Gavel, Pencil } from "lucide-react";
import { api, type DecisionFilters } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import { useMe } from "../auth/AuthContext";
import { mayEditItem } from "../auth/permissions";
import { ConfidenceMeter, EvidenceQuote, OwnerMenu, ReviewBadge, ReviewButtons, ReviewSwitch, filterByReview, reviewViewOf, useUsers } from "../components/items";
import { DateRange, Dialog, EmptyState, Field, FilterSelect, PageHeader, QueryView, RowsSkeleton, SearchInput, downloadCsv, formatDate } from "../components/ui";
import { LIST_REFRESH_INTERVAL_MS } from "../config";
import { useMutation } from "../hooks/useMutation";
import type { Decision } from "../types";

const REFRESH = ["decisions", "insights", "review", "meetings", "activity"];

function EditDecision({ decision, onClose }: { decision: Decision; onClose: () => void }) {
  const [statement, setStatement] = useState(decision.statement);
  const { run, busy } = useMutation();
  async function save() {
    const ok = await run(() => api.updateDecision(decision.id, { statement: statement.trim() }), { success: "Decision updated", refresh: REFRESH });
    if (ok) onClose();
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit decision"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || statement.trim().length < 3} onClick={save}>Save</button>
        </>
      }
    >
      <Field label="Decision" hint="Saving also confirms a suggested decision.">
        <textarea className="field" rows={3} value={statement} onChange={(e) => setStatement(e.target.value)} autoFocus />
      </Field>
      <EvidenceQuote evidence={decision.evidence} meetingId={decision.meetingId} className="mt-3" />
    </Dialog>
  );
}

export default function Decisions() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    next.delete("highlight");
    setParams(next, { replace: true });
  };
  const [q, setQ] = useState(get("q"));
  useEffect(() => {
    const t = window.setTimeout(() => q !== (params.get("q") ?? "") && set({ q }), 250);
    return () => window.clearTimeout(t);
  });
  const [editing, setEditing] = useState<Decision | null>(null);
  const { run, busy } = useMutation();

  const filters: DecisionFilters = {
    q: get("q") || undefined,
    meetingId: get("meeting") ? Number(get("meeting")) : undefined,
    ownerId: get("owner") ? Number(get("owner")) : undefined,
    departmentId: get("dept") ? Number(get("dept")) : undefined,
    from: get("from") || undefined,
    to: get("to") || undefined,
  };
  const decisions = useQuery(`decisions:${JSON.stringify(filters)}`, () => api.listDecisions(filters), { refreshMs: LIST_REFRESH_INTERVAL_MS });
  const users = useUsers();
  const depts = useQuery("departments", () => api.listDepartments());
  const meetings = useQuery("meetings:all", () => api.listMeetings());
  const highlight = get("highlight");
  const active = ["q", "meeting", "owner", "dept", "from", "to"].some((k) => params.get(k));
  const reviewView = reviewViewOf(params.get("review"));
  const shown = useMemo(() => filterByReview(decisions.data ?? [], reviewView), [decisions.data, reviewView]);

  const review = (d: Decision, status: "confirmed" | "rejected") =>
    run(() => api.updateDecision(d.id, { reviewStatus: status }), { success: `Decision ${status}`, refresh: REFRESH, undo: () => api.updateDecision(d.id, { reviewStatus: "suggested" }) });

  return (
    <div>
      <PageHeader
        icon={<Gavel className="h-5 w-5 text-faint" />}
        title="Decisions"
        description="The decision register: what was agreed, by whom, in which meeting."
        actions={
          <button
            className="btn-secondary"
            disabled={!decisions.data?.length}
            onClick={() =>
              downloadCsv("meetops-decisions.csv", [
                ["Decision", "Decided by", "Date", "Meeting", "Department", "Review", "Evidence"],
                ...shown.map((d) => [d.statement, d.owner?.name ?? d.ownerName ?? "", d.decidedAt, d.meetingTitle, d.department?.name ?? "", d.reviewStatus, d.evidence?.quote ?? ""]),
              ])
            }
          >
            <Download className="h-4 w-4" /> Export
          </button>
        }
      />
      <div className="mb-3">
        <ReviewSwitch items={decisions.data} value={reviewView} onChange={(v) => set({ review: v === "reviewed" ? "" : v })} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search decisions…" className="w-full sm:w-56" />
        <FilterSelect label="Meeting" value={get("meeting")} onChange={(v) => set({ meeting: v })} options={(meetings.data ?? []).map((m) => ({ value: String(m.id), label: m.title }))} />
        <FilterSelect label="Decided by" value={get("owner")} onChange={(v) => set({ owner: v })} options={(users.data ?? []).map((u) => ({ value: String(u.id), label: u.name }))} />
        <FilterSelect label="Department" value={get("dept")} onChange={(v) => set({ dept: v })} options={(depts.data ?? []).map((d) => ({ value: String(d.id), label: d.name }))} />
        <DateRange label="Date" from={get("from")} to={get("to")} onChange={(f, t) => set({ from: f, to: t })} />
        {active && <button className="btn-ghost" onClick={() => { setQ(""); setParams({}, { replace: true }); }}>Clear</button>}
      </div>

      <QueryView
        {...decisions}
        onRetry={decisions.reload}
        skeleton={<div className="panel"><RowsSkeleton rows={6} /></div>}
        isEmpty={() => shown.length === 0}
        empty={<div className="panel"><EmptyState title={reviewView === "needs" ? "Nothing waiting for review" : active ? "No decisions match" : reviewView === "reviewed" ? "No reviewed decisions yet" : "No decisions yet"} message={reviewView === "reviewed" && (decisions.data ?? []).some((d) => d.reviewStatus === "suggested") ? "Some decisions still need review. Switch to “Needs review” to confirm them." : active ? "Try clearing a filter." : "Agreed outcomes appear here when a meeting is processed."} /></div>}
      >
        {() => (
          <div className="panel overflow-x-auto">
            <table className="table min-w-[820px]">
              <thead>
                <tr>
                  <th className="w-[46%]">Decision</th>
                  <th>Decided by</th>
                  <th>Date</th>
                  <th>Meeting</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => {
                  const editable = mayEditItem(me, d);
                  return (
                    <tr key={d.id} className={highlight === String(d.id) ? "bg-accent-soft/60" : d.reviewStatus === "suggested" ? "bg-amber-500/[0.03]" : ""}>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-fg">{d.statement}</span>
                          <ReviewBadge status={d.reviewStatus} source={d.source} />
                        </div>
                        <EvidenceQuote evidence={d.evidence} meetingId={d.meetingId} className="mt-0.5" />
                        {d.reviewStatus === "suggested" && editable && (
                          <div className="mt-1.5 flex items-center gap-3">
                            <ReviewButtons size="sm" busy={busy} onConfirm={() => review(d, "confirmed")} onReject={() => review(d, "rejected")} />
                            <ConfidenceMeter value={d.confidence} source={d.source} />
                          </div>
                        )}
                      </td>
                      <td>
                        <OwnerMenu value={d.owner} name={d.ownerName} empty="Not recorded" disabled={!editable} onChange={(id) => run(() => api.updateDecision(d.id, { ownerId: id }), { refresh: REFRESH })} />
                      </td>
                      <td className="whitespace-nowrap text-muted">{formatDate(d.decidedAt)}</td>
                      <td>
                        <Link to={`/meetings/${d.meetingId}`} className="text-muted hover:text-accent-text">{d.meetingTitle}</Link>
                        {d.department && <div className="text-2xs text-faint">{d.department.name}</div>}
                      </td>
                      <td>
                        {editable && (
                          <button className="icon-btn h-7 w-7" title="Edit" onClick={() => setEditing(d)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
      {editing && <EditDecision decision={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
