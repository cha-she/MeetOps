import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Bell, CalendarClock, CheckCheck, UserPlus } from "lucide-react";
import { api } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import type { Notification, NotificationType } from "../types";

const icons: Record<NotificationType, typeof Bell> = {
  overdue: AlertTriangle,
  due_soon: CalendarClock,
  assigned: UserPlus,
  status_change: CheckCheck,
};

const iconTone: Record<NotificationType, string> = {
  overdue: "bg-red-50 text-red-500",
  due_soon: "bg-amber-50 text-amber-500",
  assigned: "bg-blue-50 text-blue-500",
  status_change: "bg-emerald-50 text-emerald-500",
};

export default function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data, error, loading, reload, setData } = useQuery("notifications", () =>
    api.listNotifications()
  );

  const unread = data?.filter((n) => !n.read).length ?? 0;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAllRead() {
    setData((prev) => prev?.map((n) => ({ ...n, read: true })));
    try {
      await api.markNotificationsRead();
    } catch {
      reload();
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) reload();
        }}
        className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-700"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lift sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="text-sm font-semibold text-slate-800">Notifications</div>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && !data && (
              <div className="px-4 py-8 text-center text-sm text-slate-400">Loading…</div>
            )}
            {error && !data && (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                {error.isNetworkError ? "Backend not connected." : error.message}
              </div>
            )}
            {data && data.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                You're all caught up.
              </div>
            )}
            {data?.map((n) => (
              <NotificationRow key={n.id} n={n} onNavigate={() => setOpen(false)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({ n, onNavigate }: { n: Notification; onNavigate: () => void }) {
  const Icon = icons[n.type] ?? Bell;
  const body = (
    <div className={`flex gap-3 px-4 py-3 ${n.read ? "" : "bg-brand-50/40"}`}>
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          iconTone[n.type] ?? "bg-slate-100 text-slate-500"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className={`text-sm ${n.read ? "text-slate-600" : "font-medium text-slate-800"}`}>
          {n.message}
        </div>
        <div className="mt-0.5 text-xs text-slate-400">{timeAgo(n.createdAt)}</div>
      </div>
    </div>
  );
  return n.taskId ? (
    <Link to={`/tasks?highlight=${n.taskId}`} onClick={onNavigate} className="block hover:bg-slate-50">
      {body}
    </Link>
  ) : (
    body
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} d ago`;
}
