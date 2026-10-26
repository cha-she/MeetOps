import { useEffect, useState } from "react";
import { Database, FlaskConical } from "lucide-react";
import { getDataSource, onDataSourceChange, resetDataSource, type DataSource } from "../api/endpoints";

// Small indicator in the top bar showing whether the screens are fed by the
// live backend or by the built-in demo dataset.
export default function DataSourceBadge() {
  const [source, setSource] = useState<DataSource>(getDataSource());

  useEffect(() => onDataSourceChange(setSource), []);

  if (source === "unknown") return null;

  if (source === "live") {
    return (
      <span
        className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 md:inline-flex"
        title="Connected to the MeetOps API"
      >
        <Database className="h-3.5 w-3.5" /> Live
      </span>
    );
  }

  return (
    <button
      onClick={() => {
        resetDataSource();
        window.location.reload();
      }}
      className="hidden items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 transition hover:bg-amber-100 md:inline-flex"
      title="Backend not reachable — showing built-in demo data. Click to retry the connection."
    >
      <FlaskConical className="h-3.5 w-3.5" /> Demo data
    </button>
  );
}
