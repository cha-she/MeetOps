import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  UploadCloud,
  FileAudio,
  FileVideo,
  FileText,
  Check,
  Loader2,
  AlertTriangle,
  X,
} from "lucide-react";
import { api } from "../api/endpoints";
import { ApiError } from "../api/client";
import { PIPELINE_POLL_INTERVAL_MS } from "../config";
import { PageHeader } from "../components/ui";
import type { Meeting, PipelineStage } from "../types";

// Stages reported by the backend, in order. The UI ticks them off as the
// meeting's `pipelineStage` advances.
const pipelineSteps: { key: PipelineStage; label: string }[] = [
  { key: "upload", label: "Uploading file" },
  { key: "transcribe", label: "Speech-to-text (audio/video only)" },
  { key: "preprocess", label: "Cleaning & segmenting transcript" },
  { key: "classify", label: "Classifying segments (Task / Decision / Risk / Other)" },
  { key: "extract", label: "Extracting owners, deadlines & decisions" },
  { key: "save", label: "Saving structured records" },
];

const acceptedExtensions = [".txt", ".vtt", ".srt", ".json", ".mp3", ".wav", ".m4a", ".mp4", ".mov"];

type Phase = "idle" | "uploading" | "processing" | "done" | "failed";

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function titleFromFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isMedia(name: string) {
  return /\.(mp3|wav|m4a|mp4|mov)$/i.test(name);
}

export default function UploadMeeting() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayIso());
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

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    chooseFile(e.dataTransfer.files?.[0] ?? null);
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
    const timer = setInterval(async () => {
      try {
        const latest = await api.getMeeting(meeting.id);
        setMeeting(latest);
        if (latest.status === "Processed") setPhase("done");
        if (latest.status === "Failed") setPhase("failed");
      } catch {
        // transient error: keep polling
      }
    }, PIPELINE_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [phase, meeting]);

  function reset() {
    setFile(null);
    setTitle("");
    setDate(todayIso());
    setMeeting(null);
    setPhase("idle");
    setError(null);
  }

  const currentIndex = meeting?.pipelineStage
    ? pipelineSteps.findIndex((s) => s.key === meeting.pipelineStage)
    : phase === "uploading"
    ? 0
    : -1;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Upload a meeting"
        subtitle="Drop a transcript, audio, or video file and MeetOps will turn it into structured records."
      />

      {phase === "idle" && (
        <form onSubmit={submit} className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`card flex cursor-pointer flex-col items-center justify-center px-6 py-14 text-center transition ${
              dragOver ? "border-brand-400 bg-brand-50/50" : "border-slate-200"
            }`}
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <UploadCloud className="h-8 w-8" />
            </div>
            {file ? (
              <>
                <div className="text-base font-semibold text-slate-800">{file.name}</div>
                <div className="mt-1 text-sm text-slate-400">
                  {(file.size / 1024).toFixed(0)} KB · click to choose a different file
                </div>
              </>
            ) : (
              <>
                <div className="text-base font-semibold text-slate-800">
                  Drag & drop your meeting file here
                </div>
                <div className="mt-1 text-sm text-slate-400">
                  or click to browse — TXT, VTT, SRT, MP3, WAV, MP4
                </div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept={acceptedExtensions.join(",")}
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {file && isMedia(file.name) && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Audio and video transcription is part of the next development phase. Upload a
              text transcript (TXT, VTT, or SRT) to process a meeting now.
            </div>
          )}

          <div className="card grid gap-4 p-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Meeting title
              </span>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Sprint planning"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Meeting date
              </span>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <span className="mt-1 block text-xs text-slate-400">
                Used to resolve relative deadlines such as “by Friday”.
              </span>
            </label>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="grid grid-cols-3 gap-3 text-xs text-slate-400">
              {[
                { icon: FileText, label: "Transcript · TXT VTT SRT" },
                { icon: FileAudio, label: "Audio · MP3 WAV M4A" },
                { icon: FileVideo, label: "Video · MP4 MOV" },
              ].map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <Icon className="h-4 w-4 text-brand-500" /> {label}
                </span>
              ))}
            </div>
            <button type="submit" className="btn-primary" disabled={!file}>
              Process meeting
            </button>
          </div>
        </form>
      )}

      {phase !== "idle" && (
        <div className="card p-6">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-brand-500" />
              <div>
                <div className="font-semibold text-slate-800">{meeting?.title ?? title}</div>
                <div className="text-xs text-slate-400">
                  {phase === "done" && "Processing complete"}
                  {phase === "failed" && "Processing failed"}
                  {(phase === "uploading" || phase === "processing") && "Running the MeetOps pipeline…"}
                </div>
              </div>
            </div>
            {(phase === "done" || phase === "failed") && (
              <button onClick={reset} className="btn-ghost" aria-label="Upload another">
                <X className="h-4 w-4" /> Upload another
              </button>
            )}
          </div>

          <ol className="space-y-3">
            {pipelineSteps.map((step, i) => {
              const done = phase === "done" || i < currentIndex;
              const active = (phase === "uploading" || phase === "processing") && i === currentIndex;
              const skipped = done && step.key === "transcribe" && meeting?.source === "transcript";
              return (
                <li key={step.key} className="flex items-center gap-3">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      done
                        ? "bg-emerald-100 text-emerald-600"
                        : active
                        ? "bg-brand-100 text-brand-600"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {done ? <Check className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : i + 1}
                  </span>
                  <span className={`text-sm ${done || active ? "font-medium text-slate-800" : "text-slate-400"}`}>
                    {step.label}
                    {skipped && <span className="ml-2 text-xs text-slate-400">(skipped for transcripts)</span>}
                  </span>
                </li>
              );
            })}
          </ol>

          {phase === "done" && meeting && (
            <div className="mt-6 flex flex-col gap-3 rounded-lg bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-medium text-emerald-700">
                Extracted {meeting.taskCount} tasks, {meeting.decisionCount} decisions, and {meeting.riskCount} risks.
              </div>
              <button className="btn-primary" onClick={() => navigate(`/meetings/${meeting.id}`)}>
                View results
              </button>
            </div>
          )}

          {phase === "failed" && (
            <div className="mt-6 flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {meeting?.errorMessage ?? "The pipeline failed. Check the backend logs."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
