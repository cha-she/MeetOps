import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { CalendarDays, CornerDownLeft, FileText, Gavel, Home, Inbox, LineChart, ListChecks, Search, ShieldAlert, Upload, Users } from "lucide-react";
import { api } from "../api/endpoints";
import type { SearchResults } from "../types";
import { cn } from "./ui";

interface Item {
  id: string;
  group: string;
  label: string;
  sub?: string;
  icon: JSX.Element;
  to: string;
}

const NAV: Item[] = [
  { id: "nav-home", group: "Go to", label: "My work", icon: <Home className="h-4 w-4" />, to: "/" },
  { id: "nav-review", group: "Go to", label: "Review inbox", icon: <Inbox className="h-4 w-4" />, to: "/review" },
  { id: "nav-meetings", group: "Go to", label: "Meetings", icon: <CalendarDays className="h-4 w-4" />, to: "/meetings" },
  { id: "nav-tasks", group: "Go to", label: "Tasks", icon: <ListChecks className="h-4 w-4" />, to: "/tasks" },
  { id: "nav-decisions", group: "Go to", label: "Decisions", icon: <Gavel className="h-4 w-4" />, to: "/decisions" },
  { id: "nav-risks", group: "Go to", label: "Risks", icon: <ShieldAlert className="h-4 w-4" />, to: "/risks" },
  { id: "nav-insights", group: "Go to", label: "Insights", icon: <LineChart className="h-4 w-4" />, to: "/insights" },
  { id: "nav-team", group: "Go to", label: "Team & departments", icon: <Users className="h-4 w-4" />, to: "/team" },
  { id: "act-upload", group: "Actions", label: "Upload a meeting transcript", icon: <Upload className="h-4 w-4" />, to: "/upload" },
];

// Ctrl/Cmd + K: jump anywhere, or search meetings, tasks, decisions and risks.
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let alive = true;
    const t = window.setTimeout(() => {
      api.search(term).then((r) => alive && setResults(r)).catch(() => alive && setResults(null));
    }, 180);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q]);

  const items = useMemo<Item[]>(() => {
    const term = q.trim().toLowerCase();
    const nav = NAV.filter((n) => !term || n.label.toLowerCase().includes(term));
    if (term.length < 2 || !results) return nav;
    return [
      ...nav,
      ...results.tasks.slice(0, 6).map((t) => ({ id: `t${t.id}`, group: "Tasks", label: t.description, sub: t.owner?.name ?? "Unassigned", icon: <ListChecks className="h-4 w-4" />, to: `/tasks?task=${t.id}` })),
      ...results.decisions.slice(0, 4).map((d) => ({ id: `d${d.id}`, group: "Decisions", label: d.statement, sub: d.meetingTitle, icon: <Gavel className="h-4 w-4" />, to: `/decisions?highlight=${d.id}` })),
      ...results.risks.slice(0, 4).map((r) => ({ id: `r${r.id}`, group: "Risks", label: r.description, sub: r.meetingTitle, icon: <ShieldAlert className="h-4 w-4" />, to: `/risks?highlight=${r.id}` })),
      ...results.meetings.slice(0, 4).map((m) => ({ id: `m${m.id}`, group: "Meetings", label: m.title, sub: m.date, icon: <FileText className="h-4 w-4" />, to: `/meetings/${m.id}` })),
      { id: "all", group: "Search", label: `See all results for “${q.trim()}”`, icon: <Search className="h-4 w-4" />, to: `/search?q=${encodeURIComponent(q.trim())}` },
    ];
  }, [q, results]);

  if (!open) return null;

  function choose(item: Item | undefined) {
    if (!item) return;
    onClose();
    setQ("");
    setResults(null);
    navigate(item.to);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-[600px] overflow-hidden rounded-xl border border-line bg-surface shadow-pop animate-pop-in">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="h-4 w-4 text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            placeholder="Search or jump to…"
            className="h-12 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-faint"
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="max-h-[380px] overflow-y-auto p-1.5">
          {items.map((item, i) => {
            const header = i === 0 || items[i - 1].group !== item.group ? item.group : null;
            return (
              <div key={item.id}>
                {header && <div className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-faint">{header}</div>}
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(item)}
                  className={cn("flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px]", i === active ? "bg-hover text-fg" : "text-muted")}
                >
                  <span className="text-faint">{item.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-fg">{item.label}</span>
                  {item.sub && <span className="max-w-[160px] truncate text-2xs text-faint">{item.sub}</span>}
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-faint" />}
                </button>
              </div>
            );
          })}
          {items.length === 0 && <div className="px-3 py-8 text-center text-[13px] text-faint">No matches.</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}
