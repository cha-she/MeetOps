import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Download, KanbanSquare, List, ListChecks, Plus } from "lucide-react";
import { api, type TaskFilters } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import { useMe } from "../auth/AuthContext";
import { useUsers } from "../components/items";
import { NewTaskDialog, TaskBoard, TaskList, type GroupBy } from "../components/tasks";
import { DateRange, EmptyState, FilterSelect, Menu, PageHeader, QueryView, RowsSkeleton, SearchInput, Segmented, Toggle, downloadCsv } from "../components/ui";
import { LIST_REFRESH_INTERVAL_MS } from "../config";
import type { Priority, ReviewStatus, TaskStatus } from "../types";

const GROUP_LABEL: Record<GroupBy, string> = { none: "No grouping", status: "Status", owner: "Owner", meeting: "Meeting", due: "Due date" };

export default function Tasks() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    next.delete("task");
    setParams(next, { replace: true });
  };

  const [view, setView] = useState<"list" | "board">("list");
  const [groupBy, setGroupBy] = useState<GroupBy>("due");
  const [newTask, setNewTask] = useState(false);
  const [q, setQ] = useState(get("q"));

  // debounce the free-text search into the URL
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (q !== (params.get("q") ?? "")) set({ q });
    }, 250);
    return () => window.clearTimeout(t);
  });

  const owner = get("owner") || (get("mine") ? "me" : "");
  const filters: TaskFilters = {
    q: get("q") || undefined,
    status: get("status") as TaskStatus | "",
    mine: owner === "me",
    unassigned: owner === "none",
    ownerId: owner && owner !== "me" && owner !== "none" ? Number(owner) : undefined,
    departmentId: get("dept") ? Number(get("dept")) : undefined,
    meetingId: get("meeting") ? Number(get("meeting")) : undefined,
    review: get("review") as ReviewStatus | "",
    priority: get("priority") as Priority | "",
    overdue: !!get("overdue"),
    dueFrom: get("dueFrom") || undefined,
    dueTo: get("dueTo") || undefined,
    from: get("from") || undefined,
    to: get("to") || undefined,
    sort: "deadline",
  };
  const key = `tasks:${JSON.stringify(filters)}`;
  const tasks = useQuery(key, () => api.listTasks(filters), { refreshMs: LIST_REFRESH_INTERVAL_MS });
  const users = useUsers();
  const depts = useQuery("departments", () => api.listDepartments());
  const meetings = useQuery("meetings:all", () => api.listMeetings());

  const highlight = get("task");
  useEffect(() => {
    if (!highlight || !tasks.data) return;
    const el = document.getElementById(`task-${highlight}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.classList.add("ring-2", "ring-accent/40");
    const t = window.setTimeout(() => el?.classList.remove("ring-2", "ring-accent/40"), 2500);
    return () => window.clearTimeout(t);
  }, [highlight, tasks.data]);

  const counts = useMemo(() => {
    const list = tasks.data ?? [];
    return { open: list.filter((t) => t.status !== "Completed").length, total: list.length };
  }, [tasks.data]);

  const activeFilters = ["status", "owner", "mine", "dept", "meeting", "review", "priority", "overdue", "dueFrom", "dueTo", "from", "to", "q"].some((k) => params.get(k));

  function exportCsv() {
    downloadCsv("meetops-tasks.csv", [
      ["Task", "Owner", "Department", "Due", "Status", "Priority", "Review", "Meeting", "Meeting date", "Evidence"],
      ...(tasks.data ?? []).map((t) => [t.description, t.owner?.name ?? "", t.department?.name ?? "", t.deadline ?? t.deadlineText ?? "", t.status, t.priority, t.reviewStatus, t.meetingTitle, t.meetingDate, t.evidence?.quote ?? ""]),
    ]);
  }

  return (
    <div>
      <PageHeader
        icon={<ListChecks className="h-5 w-5 text-faint" />}
        title="Tasks"
        description={`${counts.open} open of ${counts.total} shown · action items extracted from meetings, with owner, due date and the line they came from.`}
        actions={
          <>
            <button className="btn-secondary" onClick={exportCsv} disabled={!tasks.data?.length}>
              <Download className="h-4 w-4" /> Export
            </button>
            <button className="btn-primary" onClick={() => setNewTask(true)} disabled={!meetings.data?.length}>
              <Plus className="h-4 w-4" /> New task
            </button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search tasks…" className="w-full sm:w-56" />
        <FilterSelect label="Status" value={get("status")} onChange={(v) => set({ status: v })} options={["Open", "In Progress", "Completed"].map((s) => ({ value: s, label: s }))} />
        <FilterSelect
          label="Owner"
          value={owner}
          onChange={(v) => set({ owner: v, mine: "" })}
          options={[{ value: "me", label: `Me (${me.name.split(" ")[0]})` }, { value: "none", label: "Unassigned" }, ...(users.data ?? []).map((u) => ({ value: String(u.id), label: u.name }))]}
        />
        <FilterSelect label="Department" value={get("dept")} onChange={(v) => set({ dept: v })} options={(depts.data ?? []).map((d) => ({ value: String(d.id), label: d.name }))} />
        <FilterSelect label="Meeting" value={get("meeting")} onChange={(v) => set({ meeting: v })} options={(meetings.data ?? []).map((m) => ({ value: String(m.id), label: m.title }))} />
        <FilterSelect label="Review" value={get("review")} onChange={(v) => set({ review: v })} options={[{ value: "suggested", label: "Needs review" }, { value: "confirmed", label: "Confirmed" }]} />
        <FilterSelect label="Priority" value={get("priority")} onChange={(v) => set({ priority: v })} options={["High", "Medium", "Low"].map((p) => ({ value: p, label: p }))} />
        <Toggle active={!!get("overdue")} tone="red" onClick={() => set({ overdue: get("overdue") ? "" : "1" })}>
          <AlertTriangle className="h-3.5 w-3.5" /> Overdue
        </Toggle>
        <DateRange label="Due" from={get("dueFrom")} to={get("dueTo")} onChange={(f, t) => set({ dueFrom: f, dueTo: t })} />
        <DateRange label="Meeting" from={get("from")} to={get("to")} onChange={(f, t) => set({ from: f, to: t })} />
        {activeFilters && (
          <button
            className="btn-ghost"
            onClick={() => {
              setQ("");
              setParams({}, { replace: true });
            }}
          >
            Clear
          </button>
        )}
        <div className="flex-1" />
        {view === "list" && (
          <Menu
            align="right"
            header="Group by"
            trigger={() => <button className="btn-secondary">Group: {GROUP_LABEL[groupBy]}</button>}
            items={(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => ({ label: GROUP_LABEL[g], checked: g === groupBy, onSelect: () => setGroupBy(g) }))}
          />
        )}
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "list", label: <><List className="h-3.5 w-3.5" /> List</> },
            { value: "board", label: <><KanbanSquare className="h-3.5 w-3.5" /> Board</> },
          ]}
        />
      </div>

      <QueryView
        {...tasks}
        onRetry={tasks.reload}
        skeleton={<div className="panel"><RowsSkeleton rows={8} /></div>}
        isEmpty={(d) => d.length === 0 && !activeFilters}
        empty={<div className="panel"><EmptyState title="No tasks yet" message="Tasks appear here automatically when a meeting is processed, or add one by hand." /></div>}
      >
        {(list) => (view === "board" ? <TaskBoard tasks={list} /> : <div className="panel overflow-hidden"><TaskList tasks={list} groupBy={groupBy} /></div>)}
      </QueryView>

      {newTask && meetings.data && <NewTaskDialog open onClose={() => setNewTask(false)} meetings={meetings.data} defaultMeetingId={filters.meetingId} />}
    </div>
  );
}
