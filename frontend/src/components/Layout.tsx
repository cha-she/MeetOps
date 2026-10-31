import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ChevronsUpDown,
  Gavel,
  Home,
  Inbox,
  LineChart,
  ListChecks,
  LogOut,
  Menu as MenuIcon,
  Monitor,
  Moon,
  Plus,
  Search,
  ShieldAlert,
  Sun,
  Users,
  X,
} from "lucide-react";
import { api } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import { roleLabel, useAuth, useMe } from "../auth/AuthContext";
import { ACCENTS, useAccent, useTheme } from "../hooks/useTheme";
import CommandPalette from "./CommandPalette";
import NotificationsMenu from "./NotificationsMenu";
import { Avatar, Menu, cn } from "./ui";

function NavItem({ to, icon, label, count, end, tone }: { to: string; icon: ReactNode; label: string; count?: number; end?: boolean; tone?: "amber" }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => cn("nav-item", isActive && "nav-item-active")}>
      <span className="flex w-4 justify-center">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {!!count && (
        <span className={cn("rounded px-1.5 text-2xs font-semibold tabular-nums", tone === "amber" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "text-faint")}>{count}</span>
      )}
    </NavLink>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const me = useMe();
  const { signOut } = useAuth();
  const [theme, setTheme] = useTheme();
  const [accent, setAccent] = useAccent();
  const navigate = useNavigate();
  const insights = useQuery("insights", () => api.insights(), { refreshMs: 30000 });
  const t = insights.data;

  return (
    <div className="flex h-full flex-col" onClick={(e) => (e.target as HTMLElement).closest("a") && onNavigate?.()}>
      <div className="flex h-12 items-center gap-2 px-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-white">M</div>
        <span className="text-[14px] font-semibold tracking-tight">MeetOps</span>
      </div>

      <div className="px-3 pb-2">
        <button className="btn-primary w-full justify-start" onClick={() => { navigate("/upload"); onNavigate?.(); }}>
          <Plus className="h-4 w-4" /> New meeting
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-2">
        <div className="space-y-0.5">
          <NavItem to="/" end icon={<Home className="h-4 w-4" />} label="My work" count={t?.me.openTasks} />
          <NavItem to="/review" icon={<Inbox className="h-4 w-4" />} label="Review" count={t?.totals.pendingReview} tone="amber" />
        </div>
        <div className="space-y-0.5">
          <div className="px-2.5 pb-1 text-2xs font-semibold uppercase tracking-wider text-faint">Workspace</div>
          <NavItem to="/meetings" icon={<CalendarDays className="h-4 w-4" />} label="Meetings" count={t?.totals.meetings} />
          <NavItem to="/tasks" icon={<ListChecks className="h-4 w-4" />} label="Tasks" count={t?.totals.openTasks} />
          <NavItem to="/decisions" icon={<Gavel className="h-4 w-4" />} label="Decisions" count={t?.totals.decisions} />
          <NavItem to="/risks" icon={<ShieldAlert className="h-4 w-4" />} label="Risks" count={t?.totals.openRisks} />
        </div>
        <div className="space-y-0.5">
          <div className="px-2.5 pb-1 text-2xs font-semibold uppercase tracking-wider text-faint">Organisation</div>
          <NavItem to="/insights" icon={<LineChart className="h-4 w-4" />} label="Insights" />
          <NavItem to="/team" icon={<Users className="h-4 w-4" />} label="Team" />
        </div>
      </nav>

      <div className="border-t border-line p-2">
        <Menu
          width={232}
          openUp
          trigger={() => (
            <button className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-hover">
              <Avatar name={me.name} initials={me.initials} size={26} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-fg">{me.name}</span>
                <span className="block truncate text-2xs text-faint">
                  {roleLabel[me.role]}
                  {me.department && ` · ${me.department.name}`}
                </span>
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-faint" />
            </button>
          )}
          header={me.email}
          items={[
            { label: "Light", icon: <Sun className="h-3.5 w-3.5" />, checked: theme === "light", onSelect: () => setTheme("light") },
            { label: "Dark", icon: <Moon className="h-3.5 w-3.5" />, checked: theme === "dark", onSelect: () => setTheme("dark") },
            { label: "System", icon: <Monitor className="h-3.5 w-3.5" />, checked: theme === "system", onSelect: () => setTheme("system") },
            "divider",
            ...ACCENTS.map((a) => ({
              label: `${a.label} accent`,
              icon: <span className="h-3 w-3 rounded-full" style={{ background: a.swatch }} />,
              checked: accent === a.value,
              onSelect: () => setAccent(a.value),
            })),
            "divider",
            { label: "Sign out", icon: <LogOut className="h-3.5 w-3.5" />, onSelect: signOut, danger: true },
          ]}
        />
      </div>
    </div>
  );
}

function SignOutButton() {
  const { signOut } = useAuth();
  return (
    <button className="icon-btn" onClick={signOut} title="Sign out" aria-label="Sign out">
      <LogOut className="h-4 w-4" />
    </button>
  );
}

const TITLES: [RegExp, string][] = [
  [/^\/$/, "My work"],
  [/^\/review/, "Review"],
  [/^\/meetings\/\d+/, "Meeting"],
  [/^\/meetings/, "Meetings"],
  [/^\/tasks/, "Tasks"],
  [/^\/decisions/, "Decisions"],
  [/^\/risks/, "Risks"],
  [/^\/insights/, "Insights"],
  [/^\/team/, "Team"],
  [/^\/upload/, "New meeting"],
  [/^\/search/, "Search"],
];

export default function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { pathname } = useLocation();
  const title = TITLES.find(([rx]) => rx.test(pathname))?.[1] ?? "";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.title = title ? `${title} · MeetOps` : "MeetOps";
  }, [title]);

  return (
    <div className="flex h-full">
      <aside className="hidden w-[232px] shrink-0 border-r border-line bg-surface lg:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside className="h-full w-[260px] border-r border-line bg-surface animate-slide-in" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn absolute left-[268px] top-2 bg-surface" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="h-4 w-4" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-line bg-canvas/85 px-3 backdrop-blur sm:px-5">
          <button className="icon-btn lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <MenuIcon className="h-4 w-4" />
          </button>
          <span className="text-[13px] font-medium text-muted">{title}</span>
          <div className="flex-1" />
          <button onClick={() => setPaletteOpen(true)} className="hidden h-8 w-[260px] items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[13px] text-faint shadow-card transition hover:border-line-strong sm:flex">
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Search or jump to…</span>
            <span className="kbd">Ctrl K</span>
          </button>
          <button className="icon-btn sm:hidden" onClick={() => setPaletteOpen(true)} aria-label="Search">
            <Search className="h-4 w-4" />
          </button>
          <NotificationsMenu />
          <SignOutButton />
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
