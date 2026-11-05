import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock,
  Gavel,
  ListChecks,
  Plus,
  Repeat,
  ShieldAlert,
  Sparkles,
  Trash2,
  UsersRound,
  Wand2,
} from "lucide-react";
import { api } from "../api/endpoints";
import { invalidate, useQuery } from "../api/hooks";
import { useMe } from "../auth/AuthContext";
import { canDeleteMeeting, canEditMeetingItems } from "../auth/permissions";
import { CategoryChip, ConfidenceMeter, EvidenceTime, OwnerMenu, ReviewBadge, ReviewButtons, SeverityBadge, categoryTone, useUsers } from "../components/items";
import { NewDecisionDialog, NewRiskDialog } from "../components/newItems";
import { MeetingPdfButton } from "../components/pdf";
import { NewTaskDialog, TASK_REFRESH, TaskList } from "../components/tasks";
import {
  AvatarStack,
  Badge,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Menu,
  Panel,
  RowsSkeleton,
  Segmented,
  Skeleton,
  Tabs,
  cn,
  dotClass,
  formatDate,
  formatTime,
  formatDuration,
} from "../components/ui";
import { useMutation } from "../hooks/useMutation";
import type { Decision, Meeting, Risk, SpeakerInfo, Task, TranscriptSegment } from "../types";

const RULE_TEXT: Record<string, string> = {
  request: "a request with a follow-up action",
  commitment: "a first-person commitment",
  assignment: "work assigned to people in the room",
  need_to_with_deadline: "a need with a deadline",
  agreement: "agreement language",
  concern: "a stated concern or problem",
  fragment: "a fragment",
  meeting_management: "meeting management",
  open_question: "an open question",
};

const REFRESH = [...TASK_REFRESH, "decisions", "risks", "segments", "speakers"];

function TranscriptLine({ seg, highlighted, editable, onAdd }: { seg: TranscriptSegment; highlighted: boolean; editable: boolean; onAdd: (c: "Task" | "Decision" | "Risk") => void }) {
  const changed = seg.rule && seg.modelLabel && seg.modelLabel !== seg.category;
  return (
    <div id={`seg-${seg.id}`} className={cn("group flex gap-3 rounded-md px-3 py-2 transition", highlighted ? "animate-flash bg-accent-soft ring-1 ring-accent/30" : "hover:bg-hover/50")}>
      <div className="w-[76px] shrink-0 pt-0.5">
        <div className="truncate text-[12px] font-semibold text-fg">{seg.speaker ?? "—"}</div>
        <div className="font-mono text-2xs text-faint">{seg.timestamp ?? ""}</div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-relaxed text-fg">{seg.text}</p>
        {(seg.category !== "Other" || seg.corrected || changed) && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {seg.category !== "Other" && <CategoryChip category={seg.category} />}
            {seg.corrected ? (
              <span className="text-2xs text-faint">corrected by a person</span>
            ) : (
              <>
                {!changed && <ConfidenceMeter value={seg.confidence} />}
                {changed && (
                  <span className="inline-flex items-center gap-1 text-2xs text-faint" title={`The model said ${seg.modelLabel}; the rule layer changed it because the sentence is ${RULE_TEXT[seg.rule!] ?? seg.rule}.`}>
                    <Wand2 className="h-3 w-3" /> model said {seg.modelLabel} · rule: {seg.rule?.replace(/_/g, " ")}
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {editable && (
        <div className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <Menu
            align="right"
            width={210}
            header="Add from this line"
            trigger={() => (
              <button className="icon-btn h-7 w-7" aria-label="Add a task, decision or risk from this line" title="Add a task, decision or risk from this line">
                <Plus className="h-4 w-4" />
              </button>
            )}
            items={(["Task", "Decision", "Risk"] as const).map((c) => ({
              label: `Add as ${c.toLowerCase()}`,
              icon: <span className={cn("h-2 w-2 rounded-full", dotClass[categoryTone[c]])} />,
              onSelect: () => onAdd(c),
            }))}
          />
        </div>
      )}
    </div>
  );
}

function DecisionRow({ d, editable }: { d: Decision; editable: boolean }) {
  const { run, busy } = useMutation();
  return (
    <div className="border-b border-line px-4 py-2.5 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium">{d.statement}</span>
        <ReviewBadge status={d.reviewStatus} source={d.source} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <OwnerMenu value={d.owner} name={d.ownerName} empty="Not recorded" disabled={!editable} onChange={(id) => run(() => api.updateDecision(d.id, { ownerId: id }), { refresh: REFRESH })} />
        <EvidenceTime evidence={d.evidence} meetingId={d.meetingId} />
      </div>
      {d.reviewStatus === "suggested" && editable && (
        <div className="mt-1.5 flex items-center gap-3">
          <ReviewButtons size="sm" busy={busy} onConfirm={() => run(() => api.updateDecision(d.id, { reviewStatus: "confirmed" }), { refresh: REFRESH })} onReject={() => run(() => api.updateDecision(d.id, { reviewStatus: "rejected" }), { success: "Decision rejected", refresh: REFRESH })} />
          <ConfidenceMeter value={d.confidence} source={d.source} />
        </div>
      )}
    </div>
  );
}

function RiskRow({ r, editable }: { r: Risk; editable: boolean }) {
  const { run, busy } = useMutation();
  return (
    <div className="border-b border-line px-4 py-2.5 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium">{r.description}</span>
        <SeverityBadge severity={r.severity} />
        {r.recurring && (
          <Badge tone="violet">
            <Repeat className="h-3 w-3" /> Recurring
          </Badge>
        )}
        <ReviewBadge status={r.reviewStatus} source={r.source} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <OwnerMenu value={r.owner} empty="No owner" disabled={!editable} onChange={(id) => run(() => api.updateRisk(r.id, { ownerId: id }), { refresh: REFRESH })} />
        <EvidenceTime evidence={r.evidence} meetingId={r.meetingId} prefix={r.raisedBy} />
      </div>
      {r.reviewStatus === "suggested" && editable && (
        <div className="mt-1.5 flex items-center gap-3">
          <ReviewButtons size="sm" busy={busy} onConfirm={() => run(() => api.updateRisk(r.id, { reviewStatus: "confirmed" }), { refresh: REFRESH })} onReject={() => run(() => api.updateRisk(r.id, { reviewStatus: "rejected" }), { success: "Risk rejected", refresh: REFRESH })} />
          <ConfidenceMeter value={r.confidence} source={r.source} />
        </div>
      )}
    </div>
  );
}

// Structured summary: an extractive overview (most central sentences, chosen by the backend)
// followed by what was decided, who does what by when, and the risks. Built from the live items,
// so it follows every confirmation, rejection or correction. Rejected items never appear.
function MeetingSummary({ meeting, tasks, decisions, risks }: { meeting: Meeting; tasks?: Task[]; decisions?: Decision[]; risks?: Risk[] }) {
  // The overview paragraph is always shown; the point-by-point lists open on request so the
  // task / decision / risk tabs stay in view. The choice is remembered.
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("meetops.summaryOpen") === "1";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setOpen((o) => {
      try {
        localStorage.setItem("meetops.summaryOpen", o ? "0" : "1");
      } catch {
        // storage unavailable
      }
      return !o;
    });
  const pending = [...(tasks ?? []), ...(decisions ?? []), ...(risks ?? [])].filter((i) => i.reviewStatus === "suggested").length;
  const nothing = !meeting.summary && !tasks?.length && !decisions?.length && !risks?.length;
  if (nothing) return null;
  const section = (label: string, icon: JSX.Element, children: JSX.Element[] | undefined) =>
    children && children.length > 0 && (
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">
          {icon} {label}
        </div>
        <ul className="space-y-1.5">{children}</ul>
      </div>
    );
  const mark = (status: string) => status === "suggested" && <span className="ml-1 text-2xs text-amber-600 dark:text-amber-400">(to review)</span>;
  return (
    <Panel
      title="Summary"
      icon={<Sparkles className="h-4 w-4 text-faint" />}
      actions={
        <button className="btn-ghost btn-sm" onClick={toggle} aria-expanded={open}>
          {open ? "Hide key points" : "Show key points"}
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      }
    >
      <div className="space-y-4 p-4 text-[13px] leading-relaxed">
        {meeting.summary ? (
          <p className="text-muted">{meeting.summary}</p>
        ) : (
          !open && <p className="text-muted">{decisions?.length ?? 0} decisions, {tasks?.length ?? 0} action items and {risks?.length ?? 0} risks.</p>
        )}
        {open && pending > 0 && <p className="text-2xs text-faint">{pending} item{pending === 1 ? "" : "s"} not yet reviewed</p>}
        {open && section("Decisions", <Gavel className="h-3 w-3" />, decisions?.map((d) => (
          <li key={d.id} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-emerald-500" /><span>{d.statement}{d.ownerName && <span className="text-faint"> · {d.ownerName}</span>}{mark(d.reviewStatus)}</span></li>
        )))}
        {open && section("Action items", <ListChecks className="h-3 w-3" />, tasks?.map((t) => (
          <li key={t.id} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-blue-500" />
            <span className={t.status === "Completed" ? "text-muted line-through" : ""}>
              <span className="font-medium">{t.owner?.name ?? t.ownerName ?? "Unassigned"}</span>: {t.description}
              {(t.deadline || t.deadlineText) && <span className="text-faint"> · due {t.deadline ? formatDate(t.deadline, true) + (t.deadlineTime ? `, ${formatTime(t.deadlineTime)}` : "") : t.deadlineText}</span>}
              {mark(t.reviewStatus)}
            </span>
          </li>
        )))}
        {open && section("Risks", <ShieldAlert className="h-3 w-3" />, risks?.map((r) => (
          <li key={r.id} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-500" /><span>{r.description} <span className="text-faint">· {r.severity}</span>{mark(r.reviewStatus)}</span></li>
        )))}
      </div>
    </Panel>
  );
}

// Recordings come back with "Speaker 1", "Speaker 2" ...: name them once and the transcript,
// task owners and risks follow. A name that matches an account links that person. Names heard
// in the conversation ("Hi Kasun, ...") are filled in as suggestions; nothing is saved until Save.
function SpeakerNames({ meeting }: { meeting: Meeting }) {
  const users = useUsers();
  const speakers = useQuery(`speakers:${meeting.id}`, () => api.listSpeakers(meeting.id));
  const { run, busy } = useMutation();
  const [names, setNames] = useState<Record<string, string>>({});
  const list = speakers.data ?? [];
  if (!list.length) return null;

  const valueOf = (s: SpeakerInfo) => names[s.speaker] ?? s.suggestion ?? "";
  const save = (s: SpeakerInfo) => {
    const name = valueOf(s).trim();
    if (!name) return;
    return run(() => api.renameSpeaker(meeting.id, s.speaker, name), { success: `${s.speaker} is now ${name}`, refresh: REFRESH });
  };
  return (
    <Panel title="Who is who?" icon={<UsersRound className="h-4 w-4 text-faint" />} className="mb-5">
      <p className="px-4 pt-3 text-[12px] text-muted">
        Voices in this recording were told apart automatically. Name each speaker; owners and risks raised by them are updated, and a name that matches a colleague links their account.
      </p>
      <datalist id="people-names">{(users.data ?? []).map((u) => <option key={u.id} value={u.name} />)}</datalist>
      <div className="divide-y divide-line">
        {list.map((s) => {
          const suggested = !(s.speaker in names) && !!s.suggestion;
          return (
            <form
              key={s.speaker}
              className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center"
              onSubmit={(e) => {
                e.preventDefault();
                void save(s);
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">{s.speaker} <span className="font-normal text-faint">· {s.lines} line{s.lines === 1 ? "" : "s"}</span></div>
                <div className="truncate text-[12px] text-muted">“{s.sample}”</div>
                {suggested && s.heardIn && (
                  <div className="truncate text-2xs text-accent-text" title={s.heardIn}>
                    <Sparkles className="mr-1 inline h-3 w-3" />
                    Suggested from “{s.heardIn}”
                  </div>
                )}
              </div>
              <input
                className={cn("field sm:w-52", suggested && "border-accent/50")}
                list="people-names"
                placeholder="Name"
                aria-label={`Name for ${s.speaker}`}
                value={valueOf(s)}
                onChange={(e) => setNames((n) => ({ ...n, [s.speaker]: e.target.value }))}
              />
              <button className="btn-secondary btn-sm" disabled={busy || !valueOf(s).trim()}>Save</button>
            </form>
          );
        })}
      </div>
    </Panel>
  );
}

function Header({ m }: { m: Meeting }) {
  const me = useMe();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { run, busy } = useMutation();
  return (
    <div className="mb-5">
      <Link to="/meetings" className="mb-3 inline-flex items-center gap-1 text-[12px] text-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Meetings
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{m.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> {formatDate(m.date, true)}</span>
            {m.durationMin !== null && <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {formatDuration(m.durationMin)}</span>}
            {m.department && <span>{m.department.name}</span>}
            {m.uploadedBy && <span>Uploaded by {m.uploadedBy.name}</span>}
            {m.modelName && <span className="inline-flex items-center gap-1.5" title="Classifier used for this meeting"><Bot className="h-3.5 w-3.5" /> {m.modelName}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {m.participants.length > 0 && <AvatarStack people={m.participants} max={6} />}
          {m.suggestedCount > 0 && (
            <Link to={`/review?meeting=${m.id}`} className="btn-secondary">
              <Sparkles className="h-4 w-4 text-amber-500" /> Review {m.suggestedCount}
            </Link>
          )}
          {m.status === "Processed" && <MeetingPdfButton meetingId={m.id} title={m.title} />}
          {canDeleteMeeting(me, m) && (
            <button className="icon-btn" title="Delete meeting" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        danger
        busy={busy}
        title="Delete this meeting?"
        message="The transcript and every task, decision and risk extracted from it are deleted. This cannot be undone."
        confirmLabel="Delete meeting"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await run(() => api.deleteMeeting(m.id), { success: "Meeting deleted", refresh: REFRESH });
          navigate("/meetings");
        }}
      />
    </div>
  );
}

export default function MeetingDetail() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const highlight = params.get("segment");
  const me = useMe();
  const [tab, setTab] = useState<"tasks" | "decisions" | "risks">("tasks");
  const [filter, setFilter] = useState<"all" | "items">("all");
  const [adding, setAdding] = useState<"tasks" | "decisions" | "risks" | null>(null);
  const [fromLine, setFromLine] = useState<{ seg: TranscriptSegment; kind: "Task" | "Decision" | "Risk" } | null>(null);

  const meeting = useQuery(`meetings:detail:${id}`, () => api.getMeeting(id), { refreshMs: 15000 });
  const segments = useQuery(`segments:${id}`, () => api.getSegments(id));
  const tasks = useQuery(`tasks:meeting:${id}`, () => api.listTasks({ meetingId: Number(id) }));
  const decisions = useQuery(`decisions:meeting:${id}`, () => api.listDecisions({ meetingId: Number(id) }));
  const risks = useQuery(`risks:meeting:${id}`, () => api.listRisks({ meetingId: Number(id) }));

  const m = meeting.data;
  const processing = m && (m.status === "Queued" || m.status === "Processing");
  useEffect(() => {
    if (m?.status === "Processed") invalidate(`segments:${id}`, `tasks:meeting:${id}`, `decisions:meeting:${id}`, `risks:meeting:${id}`);
  }, [m?.status, id]);

  // Scroll the highlighted line into view on every click of an evidence link (also a repeated one:
  // each navigation gets a new location key).
  const { key: navKey } = useLocation();
  useEffect(() => {
    if (!highlight || !segments.data) return;
    document.getElementById(`seg-${highlight}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight, segments.data, navKey]);

  const shown = useMemo(() => (segments.data ?? []).filter((s) => filter === "all" || s.category !== "Other"), [segments.data, filter]);

  if (meeting.error && !m) return <ErrorState error={meeting.error} onRetry={meeting.reload} />;
  if (!m) return <div className="space-y-3"><Skeleton className="h-7 w-1/3" /><Skeleton className="h-4 w-1/2" /><div className="panel"><RowsSkeleton rows={8} /></div></div>;

  const editable = canEditMeetingItems(me, m);

  return (
    <div>
      <Header m={m} />

      {processing && (
        <div className="panel mb-5 flex items-center gap-3 border-blue-500/30 bg-blue-500/5 p-4 text-[13px]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          Processing: {m.pipelineStage === "transcribe" ? "transcribing the recording" : m.pipelineStage ?? m.status}
          {m.progress != null && ` ${m.progress}%`}…
        </div>
      )}
      {m.status === "Failed" && <div className="panel mb-5 border-red-500/30 bg-red-500/5 p-4 text-[13px] text-red-700 dark:text-red-300">{m.errorMessage}</div>}
      {editable && m.source !== "transcript" && m.status === "Processed" && <SpeakerNames meeting={m} />}

      <div className="grid gap-5 xl:grid-cols-[1fr_440px]">
        <Panel
          title="Transcript"
          actions={
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All lines", count: segments.data?.length },
                { value: "items", label: "Extracted", count: (segments.data ?? []).filter((s) => s.category !== "Other").length },
              ]}
            />
          }
          className="order-2 xl:order-1"
        >
          {segments.data ? (
            shown.length ? (
              <div className="max-h-[calc(100vh-220px)] space-y-0.5 overflow-y-auto p-2">
                {shown.map((s) => (
                  <TranscriptLine
                    key={String(s.id) === highlight ? `${s.id}-${navKey}` : s.id}   /* new key restarts the flash */
                    seg={s}
                    highlighted={String(s.id) === highlight}
                    editable={editable}
                    onAdd={(c) => setFromLine({ seg: s, kind: c })}
                  />
                ))}
              </div>
            ) : (
              <EmptyState compact title="No transcript lines" />
            )
          ) : (
            <RowsSkeleton rows={8} />
          )}
          {editable && segments.data && segments.data.length > 0 && (
            <div className="border-t border-line px-4 py-2 text-2xs text-faint">Wrong type? Reject the item, then hover its line and use + to add the right one. Rejections and items added from a line are saved for retraining.</div>
          )}
        </Panel>

        <div className="order-1 space-y-5 xl:order-2">
          <MeetingSummary meeting={m} tasks={tasks.data} decisions={decisions.data} risks={risks.data} />
          <Panel
            title={
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: "tasks", label: <><ListChecks className="h-3.5 w-3.5" /> Tasks</>, count: tasks.data?.length },
                  { value: "decisions", label: <><Gavel className="h-3.5 w-3.5" /> Decisions</>, count: decisions.data?.length },
                  { value: "risks", label: <><ShieldAlert className="h-3.5 w-3.5" /> Risks</>, count: risks.data?.length },
                ]}
              />
            }
            actions={
              editable ? (
                <button className="btn-ghost btn-sm" onClick={() => setAdding(tab)} title={`Add a ${tab.slice(0, -1)} the system missed`}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              ) : undefined
            }
          >
            {tab === "tasks" && (tasks.data ? <TaskList compact tasks={tasks.data} showMeeting={false} empty={<EmptyState compact title="No tasks" message="Mark a transcript line as a Task, or add one." />} /> : <RowsSkeleton rows={4} />)}
            {tab === "decisions" && (decisions.data ? (decisions.data.length ? decisions.data.map((d) => <DecisionRow key={d.id} d={d} editable={editable} />) : <EmptyState compact title="No decisions" message="Mark a transcript line as a Decision, or add one." />) : <RowsSkeleton rows={3} />)}
            {tab === "risks" && (risks.data ? (risks.data.length ? risks.data.map((r) => <RiskRow key={r.id} r={r} editable={editable} />) : <EmptyState compact title="No risks" message="Mark a transcript line as a Risk, or add one." />) : <RowsSkeleton rows={3} />)}
          </Panel>
        </div>
      </div>

      {adding === "tasks" && <NewTaskDialog open onClose={() => setAdding(null)} meetings={[m]} defaultMeetingId={m.id} />}
      {adding === "decisions" && <NewDecisionDialog open onClose={() => setAdding(null)} meetings={[m]} defaultMeetingId={m.id} />}
      {adding === "risks" && <NewRiskDialog open onClose={() => setAdding(null)} meetings={[m]} defaultMeetingId={m.id} />}
      {fromLine?.kind === "Task" && <NewTaskDialog open onClose={() => setFromLine(null)} meetings={[m]} defaultMeetingId={m.id} segmentId={fromLine.seg.id} defaultDescription={fromLine.seg.text} />}
      {fromLine?.kind === "Decision" && <NewDecisionDialog open onClose={() => setFromLine(null)} meetings={[m]} defaultMeetingId={m.id} segmentId={fromLine.seg.id} defaultText={fromLine.seg.text} />}
      {fromLine?.kind === "Risk" && <NewRiskDialog open onClose={() => setFromLine(null)} meetings={[m]} defaultMeetingId={m.id} segmentId={fromLine.seg.id} defaultText={fromLine.seg.text} />}
    </div>
  );
}
