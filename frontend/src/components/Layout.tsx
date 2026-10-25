import { NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  ListChecks,
  Gavel,
  ShieldAlert,
  LineChart,
  Search,
  Bell,
  Plus,
} from "lucide-react";

const navGroups: {
  heading: string;
  items: { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }[];
}[] = [
  {
    heading: "Overview",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/insights", label: "Insights", icon: LineChart },
    ],
  },
  {
    heading: "Workspace",
    items: [
      { to: "/meetings", label: "Meetings", icon: CalendarDays },
      { to: "/tasks", label: "Task Tracker", icon: ListChecks },
      { to: "/decisions", label: "Decision Register", icon: Gavel },
      { to: "/risks", label: "Risk Log", icon: ShieldAlert },
    ],
  },
];

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/upload": "Upload Meeting",
  "/meetings": "Meetings",
  "/tasks": "Task Tracker",
  "/decisions": "Decision Register",
  "/risks": "Risk Log",
  "/insights": "Insights",
};

function Logo({ small = false }: { small?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow ${
        small ? "h-8 w-8" : "h-10 w-10"
      }`}
    >
      <svg viewBox="0 0 32 32" className={small ? "h-4 w-4" : "h-5 w-5"} fill="none">
        <path
          d="M8 21V11l5 6 5-6v10"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="23" cy="12" r="2.2" fill="currentColor" opacity="0.85" />
      </svg>
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const title =
    pageTitles[pathname] ??
    (pathname.startsWith("/meetings/") ? "Meeting Detail" : "MeetOps");

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-sidebar-gradient px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <Logo />
          <div>
            <div className="text-base font-extrabold tracking-tight text-white">
              MeetOps
            </div>
            <div className="text-[11px] font-medium text-slate-400">
              Meeting Intelligence
            </div>
          </div>
        </div>

        <NavLink
          to="/upload"
          className="mb-6 flex items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/10 transition hover:bg-white/[0.16]"
        >
          <Plus className="h-4 w-4" />
          New meeting
        </NavLink>

        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.heading}>
              <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {group.heading}
              </div>
              <div className="flex flex-col gap-1">
                {group.items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `nav-link ${isActive ? "nav-link-active" : ""}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-gradient-soft" />
                        )}
                        <Icon className="h-[18px] w-[18px]" />
                        {label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/5 p-3 ring-1 ring-inset ring-white/10">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white">
            CS
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">
              Chamodi Shehani
            </div>
            <div className="truncate text-xs text-slate-400">
              Project Lead · Admin
            </div>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-slate-200/70 bg-white/70 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <Logo small />
            <span className="font-extrabold text-slate-900">MeetOps</span>
          </div>

          <h2 className="hidden text-lg font-bold tracking-tight text-slate-900 sm:block">
            {title}
          </h2>

          <div className="ml-auto flex items-center gap-3">
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input w-72 pl-9"
                placeholder="Search tasks, decisions, risks…"
              />
            </div>
            <button
              className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-700"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
            </button>
            <span className="hidden h-9 w-9 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white sm:inline-flex">
              CS
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-7 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl animate-fade-up">{children}</div>
        </main>
      </div>
    </div>
  );
}
