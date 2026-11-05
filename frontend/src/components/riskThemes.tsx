// Risk themes: all risks grouped by meaning (backend/app/services/clustering.py), so a manager sees
// what keeps coming up across meetings.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { api } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import type { RiskTheme } from "../types";
import { Badge, EmptyState, Panel, RowsSkeleton, formatDate } from "./ui";

const severityTone = { High: "red", Medium: "amber", Low: "neutral" } as const;

function ThemeName({ theme }: { theme: RiskTheme }) {
  if (!theme.keywords.length) return <span className="text-muted">Other risks</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {theme.keywords.map((k) => (
        <span key={k} className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[12px] font-medium text-accent-text">
          {k}
        </span>
      ))}
    </span>
  );
}

function ThemeCard({ theme, open, onToggle }: { theme: RiskTheme; open: boolean; onToggle: () => void }) {
  return (
    <div className="panel">
      <button className="flex w-full items-start gap-3 p-4 text-left hover:bg-hover/40" onClick={onToggle} aria-expanded={open}>
        {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-faint" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-faint" />}
        <div className="min-w-0 flex-1">
          <ThemeName theme={theme} />
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
            <span>
              <b className="text-fg">{theme.riskCount}</b> risk{theme.riskCount === 1 ? "" : "s"}
            </span>
            <span>
              in <b className="text-fg">{theme.meetingCount}</b> meeting{theme.meetingCount === 1 ? "" : "s"}
            </span>
            <span>{theme.openCount} open</span>
            {theme.highCount > 0 && <span className="text-red-600 dark:text-red-400">{theme.highCount} high</span>}
            {theme.firstRaised && (
              <span className="text-faint">
                {theme.firstRaised === theme.lastRaised ? formatDate(theme.firstRaised) : `${formatDate(theme.firstRaised)} – ${formatDate(theme.lastRaised)}`}
              </span>
            )}
          </div>
        </div>
      </button>
      {open && (
        <div className="divide-y divide-line border-t border-line">
          {theme.risks.map((r) => (
            <Link key={r.id} to={`/risks?highlight=${r.id}`} className="flex items-start gap-3 px-4 py-2.5 pl-11 hover:bg-hover/50">
              <span className="min-w-0 flex-1 text-[13px]">{r.description}</span>
              <Badge tone={severityTone[r.severity]}>{r.severity}</Badge>
              <span className="hidden w-48 shrink-0 truncate text-2xs text-faint sm:block">{r.meetingTitle}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function RiskThemesView({ departmentId }: { departmentId?: number }) {
  const themes = useQuery(`risk-themes:${departmentId ?? "all"}`, () => api.riskThemes(departmentId));
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true });
  if (!themes.data) return <div className="panel"><RowsSkeleton rows={5} /></div>;
  const d = themes.data;
  if (!d.themes.length)
    return <div className="panel"><EmptyState title="Not enough risks for themes yet" message="Themes appear once at least four risks have been raised across meetings." /></div>;
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted">
        {d.totalRisks} risks from all meetings grouped by meaning into {d.themes.filter((t) => t.keywords.length).length} themes ({d.method}
        {d.silhouette !== null && `, silhouette ${d.silhouette.toFixed(2)}`}). Each theme is named by its most typical words. Filters other than Department do not apply here.
      </p>
      {d.themes.map((t, i) => (
        <ThemeCard key={i} theme={t} open={!!open[i]} onToggle={() => setOpen((o) => ({ ...o, [i]: !o[i] }))} />
      ))}
    </div>
  );
}

// Compact list for the Insights page.
export function TopRiskThemes() {
  const themes = useQuery("risk-themes:all", () => api.riskThemes());
  const list = (themes.data?.themes ?? []).filter((t) => t.keywords.length).slice(0, 5);
  const max = Math.max(1, ...list.map((t) => t.riskCount));
  return (
    <Panel title="Top risk themes" icon={<Layers className="h-4 w-4 text-faint" />} actions={<Link to="/risks?view=themes" className="btn-ghost btn-sm">All</Link>}>
      {!themes.data ? (
        <RowsSkeleton rows={4} />
      ) : list.length ? (
        <div className="space-y-3 p-4">
          {list.map((t, i) => (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between gap-3">
                <ThemeName theme={t} />
                <span className="shrink-0 text-2xs text-faint">
                  {t.riskCount} risks · {t.meetingCount} meetings
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-subtle">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(t.riskCount / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState compact title="No themes yet" message="Themes appear once at least four risks have been raised." />
      )}
    </Panel>
  );
}
