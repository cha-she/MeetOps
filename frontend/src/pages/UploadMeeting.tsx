import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Check, FileAudio, FileText, FileVideo, Loader2, UploadCloud, X } from "lucide-react";
import { ApiError } from "../api/client";
import { api } from "../api/endpoints";
import { invalidate, useQuery } from "../api/hooks";
import { useMe } from "../auth/AuthContext";
import { Field, PageHeader, cn, todayIso } from "../components/ui";
import { PIPELINE_POLL_INTERVAL_MS } from "../config";
import type { Meeting, PipelineStage } from "../types";

// Stages reported by the backend, in order. The page ticks them off as the
// meeting's `pipelineStage` advances.
const STEPS: { key: PipelineStage; label: string; detail: string }[] = [
  { key: "upload", label: "Upload", detail: "File stored and meeting created" },
  { key: "transcribe", label: "Transcribe", detail: "Speech-to-text for audio and video (next phase)" },
  { key: "preprocess", label: "Preprocess", detail: "Split into speaker turns and sentences, clean the text" },
  { key: "classify", label: "Classify", detail: "Model + rule layer label every sentence Task, Decision, Risk or Other" },
  { key: "extract", label: "Extract", detail: "Owners, deadlines, titles; merge replies; recurring risks" },
  { key: "save", label: "Save", detail: "Registers, summary, notifications and audit log" },
];

const ACCEPT = ".txt,.md,.vtt,.srt,.mp3,.wav,.m4a,.ogg,.mp4,.mkv,.webm,.mov";
type Phase = "idle" | "uploading" | "processing" | "done" | "failed";

function titleFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function fileIcon(name: string) {
  if (/\.(mp3|wav|m4a|ogg)$/i.test(name)) return <FileAudio className="h-5 w-5" />;
  if (/\.(mp4|mkv|webm|mov)$/i.test(name)) return <FileVideo className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
}

export default function UploadMeeting() {
  const me = useMe();
  const inputRef = useRef<HTMLInputElement>(null);
  const depts = useQuery("departments", () => api.listDepartments());

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayIso());
  const [deptId, setDeptId] = useState<number | "">(me.department?.id ?? "");
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [error, setError] = useState<string | null>(null);

  function chooseFile(f: File | null) {
    if (!f) return;
    setFile(f);
    if (!title) setTitle(titleFromFilename(f.name));
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setPhase("uploading");
    const form = new FormData();
    form.append("file", file);
    form.append("title", title.trim() || titleFromFilename(file.name));
    form.append("date", date);
    if (deptId) form.append("departmentId", String(deptId));
    try {
      const created = await api.uploadMeeting(form);
      setMeeting(created);
      setPhase(created.status === "Processed" ? "done" : created.status === "Failed" ? "failed" : "processing");
    } catch (err) {
      setPhase("idle");
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    }
  }

  // Poll the meeting while the backend pipeline runs.
  useEffect(() => {
    if (phase !== "processing" || !meeting) return;
    const timer = window.setInterval(async () => {
      try {
        const latest = await api.getMeeting(meeting.id);
        setMeeting(latest);
        if (latest.status === "Processed" || latest.status === "Failed") {
          setPhase(latest.status === "Processed" ? "done" : "failed");
          invalidate();
        }
      } catch {
        // transient error: keep polling
      }
    }, PIPELINE_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [phase, meeting]);

  function reset() {
    setFile(null);
    setTitle("");
    setDate(todayIso());
    setMeeting(null);
    setPhase("idle");
    setError(null);
  }

  const current = phase === "done" ? STEPS.length : meeting?.pipelineStage ? STEPS.findIndex((s) => s.key === meeting.pipelineStage) : phase === "uploading" ? 0 : -1;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New meeting" description="Upload a transcript and MeetOps turns it into tasks, decisions and risks, each linked to the line it came from." />

      {phase === "idle" ? (
        <form onSubmit={submit} className="panel space-y-4 p-5">
          <div
            onDragOver={(e: DragEvent) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              setDragOver(false);
              chooseFile(e.dataTransfer.files?.[0] ?? null);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn("flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line-strong px-6 py-10 text-center transition hover:bg-hover/40", dragOver && "border-accent bg-accent-soft/50")}
          >
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} />
            {file ? (
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-subtle text-muted">{fileIcon(file.name)}</span>
                <span className="text-left">
                  <span className="block text-[13px] font-medium">{file.name}</span>
                  <span className="block text-2xs text-faint">{(file.size / 1024).toFixed(1)} KB · click to change</span>
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <UploadCloud className="mb-2 h-6 w-6 text-faint" />
                <div className="text-[13px] font-medium">Drop a file here or click to browse</div>
                <div className="mt-1 text-[12px] text-faint">Transcripts (.txt, .vtt, .srt): “Speaker: text” lines, Teams/Zoom exports or plain minutes</div>
              </>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_150px_180px]">
            <Field label="Title">
              <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sprint 9 planning" required />
            </Field>
            <Field label="Meeting date">
              <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="Department">
              <select className="field" value={deptId} onChange={(e) => setDeptId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">None</option>
                {(depts.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-300">{error}</div>}

          <div className="flex justify-end">
            <button className="btn-primary" disabled={!file}>
              Upload and process <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
      ) : (
        <div className="panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold">{meeting?.title ?? title}</div>
              <div className="text-[12px] text-muted">
                {phase === "done" ? "Processing complete" : phase === "failed" ? "Processing stopped" : "Processing… you can leave this page, it continues in the background."}
              </div>
            </div>
            {phase === "processing" || phase === "uploading" ? <Loader2 className="h-5 w-5 animate-spin text-accent" /> : null}
          </div>

          <ol className="space-y-1">
            {STEPS.map((s, i) => {
              const skipped = s.key === "transcribe" && meeting?.source === "transcript" && i < current;
              const failedHere = phase === "failed" && i === current;
              const done = i < current || phase === "done";
              const running = i === current && phase !== "done" && phase !== "failed";
              return (
                <li key={s.key} className={cn("flex items-start gap-3 rounded-md px-2 py-2", running && "bg-accent-soft/50")}>
                  <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-2xs", done ? "border-emerald-500 bg-emerald-500 text-white" : failedHere ? "border-red-500 bg-red-500 text-white" : running ? "border-accent text-accent" : "border-line text-faint")}>
                    {done ? <Check className="h-3 w-3" /> : failedHere ? <X className="h-3 w-3" /> : running ? <Loader2 className="h-3 w-3 animate-spin" /> : i + 1}
                  </span>
                  <span>
                    <span className={cn("block text-[13px] font-medium", !done && !running && "text-muted")}>
                      {s.label}
                      {skipped && <span className="ml-2 text-2xs font-normal text-faint">skipped for text transcripts</span>}
                    </span>
                    <span className="block text-[12px] text-faint">{s.detail}</span>
                  </span>
                </li>
              );
            })}
          </ol>

          {phase === "failed" && meeting?.errorMessage && (
            <div className="mt-4 flex gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {meeting.errorMessage}
            </div>
          )}

          {phase === "done" && meeting && (
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              {[
                ["Tasks", meeting.taskCount],
                ["Decisions", meeting.decisionCount],
                ["Risks", meeting.riskCount],
              ].map(([label, n]) => (
                <div key={label} className="rounded-md border border-line p-3">
                  <div className="text-xl font-semibold tabular-nums">{n}</div>
                  <div className="text-2xs text-faint">{label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            {(phase === "done" || phase === "failed") && (
              <button className="btn-secondary" onClick={reset}>
                Upload another
              </button>
            )}
            {meeting && phase === "done" && meeting.suggestedCount > 0 && (
              <Link to={`/review?meeting=${meeting.id}`} className="btn-secondary">
                Review {meeting.suggestedCount} items
              </Link>
            )}
            {meeting && (
              <Link to={`/meetings/${meeting.id}`} className="btn-primary">
                Open meeting <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
