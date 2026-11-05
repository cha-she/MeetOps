// Model feedback: every confirm, reject and label correction made in the app, which of them will be
// used to train the next model version, and which model versions passed the comparison check.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BrainCircuit, Download } from "lucide-react";
import { saveFile } from "../api/download";
import { api } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import { CategoryChip } from "../components/items";
import { Badge, EmptyState, PageHeader, Panel, QueryView, Skeleton, Stat, cn, timeAgo, type Tone } from "../components/ui";
import { useMutation } from "../hooks/useMutation";
import type { FeedbackAction, FeedbackItem, ModelVersion, TrainingStatus } from "../types";

const actionTone: Record<FeedbackAction, Tone> = { rejected: "red", added: "violet", confirmed: "green" };
const actionText: Record<FeedbackAction, string> = { rejected: "Rejected", added: "Added from line", confirmed: "Confirmed" };
const statusTone: Record<TrainingStatus, Tone> = { ready: "green", "in test set": "amber", "already in training": "neutral", replaced: "neutral" };
const statusHelp: Record<TrainingStatus, string> = {
  ready: "Will be used in the next training run",
  "in test set": "Not used: this sentence is in a test set, training on it would make the test score look better than it is",
  "already in training": "Not used: this sentence is already in the training data",
  replaced: "Not used: a later decision on the same sentence replaced this one",
};
const versionTone: Record<ModelVersion["status"], Tone> = { "in use": "green", rejected: "red", "not used": "neutral" };
const FILTERS: { key: FeedbackAction | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "rejected", label: "Rejected" },
  { key: "added", label: "Added from line" },
  { key: "confirmed", label: "Confirmed" },
];

export default function ModelFeedback() {
  const feedback = useQuery("feedback", () => api.modelFeedback(), { refreshMs: 20000 });
  const { run, busy } = useMutation();
  const [filter, setFilter] = useState<FeedbackAction | "all">("all");

  const download = async () => {
    const blob = await run(() => api.feedbackCsv(), { refresh: ["activity"] });
    if (blob) saveFile(blob, `meetops-feedback-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div>
      <PageHeader
        icon={<BrainCircuit className="h-5 w-5 text-faint" />}
        title="Model feedback"
        description="Every confirm, reject and item added from a transcript line is saved here and used to train the next model version."
        actions={
          <button className="btn-secondary" onClick={download} disabled={busy || !feedback.data?.totals.ready} title="Download the corrections that are ready for training (CSV, same columns as the labelled datasets)">
            <Download className="h-4 w-4" /> {busy ? "Preparing…" : "Training CSV"}
          </button>
        }
      />
      <QueryView
        {...feedback}
        onRetry={feedback.reload}
        skeleton={<div className="grid gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>}
      >
        {(d) => {
          const items = filter === "all" ? d.items : d.items.filter((i) => i.action === filter);
          return (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Corrections saved" value={d.totals.all} hint="confirms, rejects and items added from a line" />
                <Stat label="Model was right" value={d.totals.confirmed} tone="green" hint="confirmed by a person" />
                <Stat label="Model was wrong" value={d.totals.changed} tone="red" hint="rejected, or a different type added" />
                <Stat label="Ready for training" value={d.totals.ready} tone="accent" hint={Object.entries(d.readyByLabel).map(([k, v]) => `${k} ${v}`).join(" · ") || "none yet"} />
              </div>

              <Panel title="How corrections reach the model">
                <ol className="grid gap-2 p-4 text-[13px] sm:grid-cols-4">
                  <Step n={1} title="Collect" text={`${d.totals.all} saved from Review and the transcript`} />
                  <Step n={2} title="Clean" text={`${d.totals.inTestSet} in a test set and ${d.totals.alreadyInTraining} already in training are left out; ${d.totals.replaced} replaced by a later decision`} />
                  <Step n={3} title="Retrain" text={`${d.totals.ready} new sentences are added to the training data`} />
                  <Step n={4} title="Compare" text="The new version goes live only if it is not worse than the one in use on the same test sets" last />
                </ol>
              </Panel>

              <Panel title="Model versions">
                {d.models.length === 0 ? (
                  <EmptyState compact title="No trained models found" message="Models are trained with the ml package and kept in ml/models/." />
                ) : (
                  <div className="divide-y divide-line">
                    {d.models.map((m) => (
                      <div key={m.version} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[13px]">
                        <span className="w-10 font-semibold text-fg">{m.version}</span>
                        <span className="w-40 text-muted">{m.model}</span>
                        <span className="w-32 text-faint">{m.trainRows ? `${m.trainRows.toLocaleString()} training rows` : ""}</span>
                        <Badge tone={versionTone[m.status]}>{m.status}</Badge>
                        {m.note && <span className="text-2xs text-faint">{m.note}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel
                title="Latest corrections"
                actions={
                  <div className="flex gap-1">
                    {FILTERS.map((f) => (
                      <button key={f.key} onClick={() => setFilter(f.key)} className={cn("rounded px-2 py-1 text-2xs font-medium", filter === f.key ? "bg-subtle text-fg ring-1 ring-line" : "text-muted hover:text-fg")}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                }
              >
                {items.length === 0 ? (
                  <EmptyState compact title="Nothing here yet" message="Confirm or reject an item in Review, or change a line's label in a meeting transcript. It appears here straight away." action={<Link to="/review" className="btn-secondary">Go to Review</Link>} />
                ) : (
                  <div className="divide-y divide-line">{items.map((i) => <Row key={i.id} item={i} />)}</div>
                )}
              </Panel>
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}

function Step({ n, title, text, last = false }: { n: number; title: string; text: string; last?: boolean }) {
  return (
    <li className="flex gap-2">
      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent-text">{n}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-1 font-medium text-fg">{title} {!last && <ArrowRight className="h-3 w-3 text-faint" />}</div>
        <div className="text-2xs text-muted">{text}</div>
      </div>
    </li>
  );
}

function Row({ item }: { item: FeedbackItem }) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="w-24 flex-none">
        <Badge tone={actionTone[item.action]}>{actionText[item.action]}</Badge>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-fg">{item.text}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-faint">
          <span>Model said</span> <CategoryChip category={item.predicted} />
          {item.predicted !== item.corrected && (<><ArrowRight className="h-3 w-3" /> <span>person said</span> <CategoryChip category={item.corrected} /></>)}
          {item.meetingId && <Link to={`/meetings/${item.meetingId}`} className="hover:text-fg hover:underline">· {item.meetingTitle}</Link>}
          <span>· {item.by ?? "someone"}{item.at ? `, ${timeAgo(item.at)}` : ""}</span>
        </div>
      </div>
      <div className="flex-none" title={statusHelp[item.trainingStatus]}>
        <Badge tone={statusTone[item.trainingStatus]}>{item.trainingStatus === "ready" ? "ready for training" : item.trainingStatus}</Badge>
      </div>
    </div>
  );
}
