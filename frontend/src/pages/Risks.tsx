import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, Repeat, ShieldAlert } from "lucide-react";
import { api, type RiskFilters } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import { useMe } from "../auth/AuthContext";
import { mayEditItem } from "../auth/permissions";
import { ConfidenceMeter, EvidenceQuote, OwnerMenu, ReviewBadge, ReviewButtons, riskStatusTone, severityTone, useUsers } from "../components/items";
import { Badge, DateRange, EmptyState, FilterSelect, Menu, PageHeader, QueryView, RowsSkeleton, SearchInput, Stat, Toggle, downloadCsv, formatDate } from "../components/ui";
import { LIST_REFRESH_INTERVAL_MS } from "../config";
import { useMutation } from "../hooks/useMutation";
import type { ReviewStatus, Risk, RiskSeverity, RiskStatus } from "../types";

const REFRESH = ["risks", "insights", "review", "meetings", "activity"];

export default function Risks() {
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
  const { run, busy } = useMutation();

  const filters: RiskFilters = {
    q: get("q") || undefined,
    severity: get("severity") as RiskSeverity | "",
    status: (get("status") || "") as RiskStatus | "",
    meetingId: get("meeting") ? Number(get("meeting")) : undefined,
    ownerId: get("owner") ? Number(get("owner")) : undefined,
    departmentId: get("dept") ? Number(get("dept")) : undefined,
    recurring: get("recurring") ? true : undefined,
    review: get("review") as ReviewStatus | "",
    from: get("from") || undefined,
    to: get("to") || undefined,
  };
  const risks = useQuery(`risks:${JSON.stringify(filters)}`, () => api.listRisks(filters), { refreshMs: LIST_REFRESH_INTERVAL_MS });
  const users = useUsers();
  const depts = useQuery("departments", () => api.listDepartments());
  const meetings = useQuery("meetings:all", () => api.listMeetings());
  const highlight = get("highlight");
  const active = ["q", "severity", "status", "meeting", "owner", "dept", "recurring", "review", "from", "to"].some((k) => params.get(k));

  const stats = useMemo(() => {
    const l = risks.data ?? [];
    const open = l.filter((r) => r.status === "Open");
    return { open: open.length, high: open.filter((r) => r.severity === "High").length, recurring: l.filter((r) => r.recurring).length, unowned: open.filter((r) => !r.owner).length };
  }, [risks.data]);

  const patch = (r: Risk, p: Parameters<typeof api.updateRisk>[1], success?: string) => run(() => api.updateRisk(r.id, p), { success, refresh: REFRESH });
  const review = (r: Risk, status: "confirmed" | "rejected") =>
    run(() => api.updateRisk(r.id, { reviewStatus: status }), { success: `Risk ${status}`, refresh: REFRESH, undo: () => api.updateRisk(r.id, { reviewStatus: "suggested" }) });

  return (
    <div>
      <PageHeader
        icon={<ShieldAlert className="h-5 w-5 text-faint" />}
        title="Risks"
        description="The risk log: concerns and blockers raised in meetings, with severity, owner and status."
        actions={
          <button
            className="btn-secondary"
            disabled={!risks.data?.length}
            onClick={() =>
              downloadCsv("meetops-risks.csv", [
                ["Risk", "Severity", "Status", "Owner", "Raised by", "Raised", "Recurring", "Meeting", "Review", "Evidence"],
                ...(risks.data ?? []).map((r) => [r.description, r.severity, r.status, r.owner?.name ?? "", r.raisedBy ?? "", r.raisedAt, r.recurring ? "yes" : "", r.meetingTitle, r.reviewStatus, r.evidence?.quote ?? ""]),
              ])
            }
          >
            <Download className="h-4 w-4" /> Export
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open risks" value={stats.open} onClick={() => set({ status: "Open" })} />
        <Stat label="High severity" value={stats.high} tone="red" onClick={() => set({ severity: "High", status: "Open" })} />
        <Stat label="Recurring" value={stats.recurring} tone="violet" hint="Raised again in a later meeting" onClick={() => set({ recurring: "1" })} />
        <Stat label="Without an owner" value={stats.unowned} tone="amber" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search risks…" className="w-full sm:w-56" />
        <FilterSelect label="Severity" value={get("severity")} onChange={(v) => set({ severity: v })} options={["High", "Medium", "Low"].map((s) => ({ value: s, label: s }))} />
        <FilterSelect label="Status" value={get("status")} onChange={(v) => set({ status: v })} options={["Open", "Mitigated", "Closed"].map((s) => ({ value: s, label: s }))} />
        <FilterSelect label="Owner" value={get("owner")} onChange={(v) => set({ owner: v })} options={(users.data ?? []).map((u) => ({ value: String(u.id), label: u.name }))} />
        <FilterSelect label="Meeting" value={get("meeting")} onChange={(v) => set({ meeting: v })} options={(meetings.data ?? []).map((m) => ({ value: String(m.id), label: m.title }))} />
        <FilterSelect label="Department" value={get("dept")} onChange={(v) => set({ dept: v })} options={(depts.data ?? []).map((d) => ({ value: String(d.id), label: d.name }))} />
        <FilterSelect label="Review" value={get("review")} onChange={(v) => set({ review: v })} options={[{ value: "suggested", label: "Needs review" }, { value: "confirmed", label: "Confirmed" }]} />
        <Toggle active={!!get("recurring")} onClick={() => set({ recurring: get("recurring") ? "" : "1" })}>
          <Repeat className="h-3.5 w-3.5" /> Recurring
        </Toggle>
        <DateRange label="Raised" from={get("from")} to={get("to")} onChange={(f, t) => set({ from: f, to: t })} />
        {active && <button className="btn-ghost" onClick={() => { setQ(""); setParams({}, { replace: true }); }}>Clear</button>}
      </div>

      <QueryView
        {...risks}
        onRetry={risks.reload}
        skeleton={<div className="panel"><RowsSkeleton rows={6} /></div>}
        isEmpty={(d) => d.length === 0}
        empty={<div className="panel"><EmptyState title={active ? "No risks match" : "No risks yet"} message={active ? "Try clearing a filter." : "Concerns raised in meetings appear here automatically."} /></div>}
      >
        {(list) => (
          <div className="panel overflow-x-auto">
            <table className="table min-w-[900px]">
              <thead>
                <tr>
                  <th className="w-[42%]">Risk</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>Raised</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const editable = mayEditItem(me, r);
                  return (
                    <tr key={r.id} className={highlight === String(r.id) ? "bg-accent-soft/60" : r.reviewStatus === "suggested" ? "bg-amber-500/[0.03]" : ""}>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-fg">{r.description}</span>
                          {r.recurring && (
                            <Badge tone="violet" title="A similar risk was raised in an earlier meeting">
                              <Repeat className="h-3 w-3" /> Recurring
                            </Badge>
                          )}
                          <ReviewBadge status={r.reviewStatus} source={r.source} />
                        </div>
                        <EvidenceQuote evidence={r.evidence} meetingId={r.meetingId} className="mt-0.5" />
                        {r.reviewStatus === "suggested" && editable && (
                          <div className="mt-1.5 flex items-center gap-3">
                            <ReviewButtons size="sm" busy={busy} onConfirm={() => review(r, "confirmed")} onReject={() => review(r, "rejected")} />
                            <ConfidenceMeter value={r.confidence} source={r.source} />
                          </div>
                        )}
                      </td>
                      <td>
                        <Menu
                          header="Severity"
                          width={150}
                          trigger={() => <button disabled={!editable}><Badge tone={severityTone[r.severity]}>{r.severity}</Badge></button>}
                          items={(["High", "Medium", "Low"] as RiskSeverity[]).map((s) => ({ label: s, checked: s === r.severity, onSelect: () => patch(r, { severity: s }) }))}
                        />
                      </td>
                      <td>
                        <Menu
                          header="Status"
                          width={150}
                          trigger={() => <button disabled={!editable}><Badge tone={riskStatusTone[r.status]}>{r.status}</Badge></button>}
                          items={(["Open", "Mitigated", "Closed"] as RiskStatus[]).map((s) => ({ label: s, checked: s === r.status, onSelect: () => patch(r, { status: s }, `Risk marked ${s.toLowerCase()}`) }))}
                        />
                      </td>
                      <td>
                        <OwnerMenu value={r.owner} empty="No owner" disabled={!editable} onChange={(id) => patch(r, { ownerId: id }, "Owner updated")} />
                      </td>
                      <td>
                        <div className="whitespace-nowrap text-muted">{formatDate(r.raisedAt)}</div>
                        <Link to={`/meetings/${r.meetingId}`} className="block max-w-[180px] truncate text-2xs text-faint hover:text-accent-text">
                          {r.raisedBy ? `${r.raisedBy} · ` : ""}
                          {r.meetingTitle}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
    </div>
  );
}
