import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, CalendarClock, CheckCheck, RefreshCw, Sparkles, UserPlus } from "lucide-react";
import { api } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import type { Notification, NotificationType } from "../types";
import { cn, timeAgo } from "./ui";

const icon: Record<NotificationType, JSX.Element> = {
  overdue: <AlertTriangle className="h-3.5 w-3.5 text-red-500" />,
  due_soon: <CalendarClock className="h-3.5 w-3.5 text-amber-500" />,
  assigned: <UserPlus className="h-3.5 w-3.5 text-accent" />,
  status_change: <RefreshCw className="h-3.5 w-3.5 text-blue-500" />,
  review: <Sparkles className="h-3.5 w-3.5 text-amber-500" />,
};

export default function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const list = useQuery("notifications", () => api.listNotifications(), { refreshMs: 30000 });
  const unread = (list.data ?? []).filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function markAll() {
    list.setData((prev) => prev?.map((n) => ({ ...n, read: true })));
    await api.markNotificationsRead().catch(() => list.reload());
  }

  function go(n: Notification) {
    setOpen(false);
    if (n.type === "review" && n.meetingId) navigate(`/review?meeting=${n.meetingId}`);
    else if (n.taskId) navigate(`/tasks?task=${n.taskId}`);
    else if (n.meetingId) navigate(`/meetings/${n.meetingId}`);
  }

  return (
    <div className="relative" ref={ref}>
      <button className="icon-btn relative" onClick={() => setOpen((o) => !o)} aria-label={`Notifications (${unread} unread)`}>
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-surface" />}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-[360px] overflow-hidden rounded-lg border border-line bg-surface shadow-pop animate-pop-in">
          <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <span className="text-[13px] font-semibold">Notifications</span>
            {unread > 0 && (
              <button className="btn-ghost btn-sm" onClick={markAll}>
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {(list.data ?? []).length === 0 && <div className="px-4 py-10 text-center text-[13px] text-faint">You're all caught up.</div>}
            {(list.data ?? []).map((n) => (
              <button key={n.id} onClick={() => go(n)} className={cn("flex w-full gap-2.5 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-hover", !n.read && "bg-accent-soft/40")}>
                <span className="mt-0.5">{icon[n.type]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] leading-snug text-fg">{n.message}</span>
                  <span className="mt-0.5 block text-2xs text-faint">{timeAgo(n.createdAt)}</span>
                </span>
                {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
