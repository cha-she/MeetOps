import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity as ActivityIcon, ArrowRight, CalendarDays, Inbox, Plus, Upload } from "lucide-react";
import { api } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import { useMe } from "../auth/AuthContext";
import { NewTaskDialog, TaskList } from "../components/tasks";
import { AvatarStack, Badge, EmptyState, Panel, QueryView, RowsSkeleton, Segmented, Stat, formatDate, formatLongDate, timeAgo } from "../components/ui";
import { LIST_REFRESH_INTERVAL_MS } from "../config";
import type { Activity } from "../types";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const ACTION_TEXT: Record<string, string> = {
  created: "created",
  updated: "updated",
  confirmed: "confirmed",
  rejected: "rejected",
  processed: "processed",
  reclassified: "corrected",
  deleted: "deleted",
  failed: "failed to process",
};

function activityLine(a: Activity) {
  const who = a.actor?.name ?? "MeetOps";
  const what = a.entity === "meeting" && a.action === "processed" ? "a meeting" : `a ${a.entity}`;
  return (
    <>
      <span className="font-medium text-fg">{who}</span> {ACTION_TEXT[a.action] ?? a.action} {what}
      {a.detail && <span className="text-faint"> · {a.detail.length > 70 ? a.detail.slice(0, 70) + "…" : a.detail}</span>}
    </>
  );
}

export default function Home() {
  const me = useMe();
  const navigate = useNavigate();
  const [scope, setScope] = useState<"open" | "all">("open");
  const [newTask, setNewTask] = useState(false);

  const insights = useQuery("insights", () => api.insights(), { refreshMs: LIST_REFRESH_INTERVAL_MS });
  const myTasks = useQuery("tasks:mine", () => api.listTasks({ mine: true, sort: "deadline" }), { refreshMs: LIST_REFRESH_INTERVAL_MS });
  const meetings = useQuery("meetings:recent", () => api.listMeetings({ limit: 6 }), { refreshMs: LIST_REFRESH_INTERVAL_MS });
  const activity = useQuery("activity:home", () => api.activity({ limit: 12 }), { refreshMs: LIST_REFRESH_INTERVAL_MS });

  const m = insights.data?.me;
  const t = insights.data?.totals;
  const tasks = (myTasks.data ?? []).filter((x) => scope === "all" || x.status !== "Completed");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[12px] font-medium text-faint">{formatLongDate(new Date())}</div>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight">
            {greeting()}, {me.name.split(" ")[0]}
          </h1>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setNewTask(true)} disabled={!meetings.data?.length}>
            <Plus className="h-4 w-4" /> New task
          </button>
          <Link to="/upload" className="btn-primary">
            <Upload className="h-4 w-4" /> Upload meeting
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="My open tasks" value={m?.openTasks ?? "–"} hint={`${m?.completedThisWeek ?? 0} completed this week`} onClick={() => navigate("/tasks?mine=1")} />
        <Stat label="Due this week" value={m?.dueThisWeek ?? "–"} tone="amber" hint="Not completed yet" onClick={() => navigate("/tasks?mine=1")} />
        <Stat label="Overdue" value={m?.overdueTasks ?? "–"} tone="red" hint={`${t?.overdueTasks ?? 0} across the team`} onClick={() => navigate("/tasks?overdue=1")} />
        <Stat label="Waiting for review" value={t?.pendingReview ?? "–"} tone="violet" hint="Extracted, not yet confirmed" onClick={() => navigate("/review")} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Panel
          title="My tasks"
          actions={
            <div className="flex items-center gap-2">
              <Segmented value={scope} onChange={setScope} options={[{ value: "open", label: "Open" }, { value: "all", label: "All" }]} />
              <Link to="/tasks?mine=1" className="btn-ghost btn-sm">
                Open in Tasks <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          }
        >
          <QueryView {...myTasks} onRetry={myTasks.reload}>
            {() => (
              <TaskList
                tasks={tasks}
                groupBy="due"
                empty={<EmptyState compact title="Nothing assigned to you" message="Tasks extracted from meetings appear here when you are the owner." />}
              />
            )}
          </QueryView>
        </Panel>

        <div className="space-y-6">
          {!!t?.pendingReview && (
            <Link to="/review" className="panel flex items-center gap-3 border-amber-500/30 bg-amber-500/5 p-4 transition hover:bg-amber-500/10">
              <Inbox className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <div className="flex-1">
                <div className="text-[13px] font-semibold">{t.pendingReview} items need review</div>
                <div className="text-[12px] text-muted">Confirm or reject what the system was not sure about.</div>
              </div>
              <ArrowRight className="h-4 w-4 text-faint" />
            </Link>
          )}

          <Panel title="Recent meetings" icon={<CalendarDays className="h-4 w-4 text-faint" />} actions={<Link to="/meetings" className="btn-ghost btn-sm">All</Link>}>
            <QueryView {...meetings} onRetry={meetings.reload} skeleton={<RowsSkeleton rows={3} />} isEmpty={(d) => d.length === 0} empty={<EmptyState compact title="No meetings yet" action={<Link to="/upload" className="btn-primary btn-sm">Upload the first one</Link>} />}>
              {(list) => (
                <div className="divide-y divide-line">
                  {list.map((mt) => (
                    <Link key={mt.id} to={`/meetings/${mt.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover/50">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">{mt.title}</div>
                        <div className="text-2xs text-faint">
                          {formatDate(mt.date)} · {mt.taskCount} tasks · {mt.decisionCount} decisions · {mt.riskCount} risks
                        </div>
                      </div>
                      {mt.status !== "Processed" ? <Badge tone={mt.status === "Failed" ? "red" : "blue"}>{mt.status}</Badge> : mt.suggestedCount > 0 ? <Badge tone="amber">{mt.suggestedCount} to review</Badge> : <AvatarStack people={mt.participants} max={3} size={20} />}
                    </Link>
                  ))}
                </div>
              )}
            </QueryView>
          </Panel>

          <Panel title="Activity" icon={<ActivityIcon className="h-4 w-4 text-faint" />}>
            <QueryView {...activity} onRetry={activity.reload} skeleton={<RowsSkeleton rows={4} />} isEmpty={(d) => d.length === 0} empty={<EmptyState compact title="No activity yet" />}>
              {(list) => (
                <ol className="space-y-3 p-4">
                  {list.map((a) => (
                    <li key={a.id} className="flex gap-2.5 text-[12px] leading-snug text-muted">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
                      <span className="min-w-0 flex-1">
                        {a.meetingId ? <Link to={`/meetings/${a.meetingId}`} className="hover:text-fg">{activityLine(a)}</Link> : activityLine(a)}
                        <span className="block text-2xs text-faint">{timeAgo(a.createdAt)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </QueryView>
          </Panel>
        </div>
      </div>

      {newTask && meetings.data && <NewTaskDialog open onClose={() => setNewTask(false)} meetings={meetings.data} />}
    </div>
  );
}
