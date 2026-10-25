import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  UploadCloud,
  FileAudio,
  FileVideo,
  FileText,
  Check,
  Loader2,
} from "lucide-react";
import { PageHeader } from "../components/ui";

const pipelineSteps = [
  "Uploading media",
  "Extracting audio (FFmpeg)",
  "Speech-to-text (Whisper)",
  "Cleaning & segmenting transcript",
  "Classifying segments (Task / Decision / Risk)",
  "Extracting owners & deadlines",
  "Saving structured records",
];

type Phase = "idle" | "processing" | "done";

export default function UploadMeeting() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeStep, setActiveStep] = useState(0);
  const [fileName, setFileName] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Simulated processing pipeline for the demo.
  useEffect(() => {
    if (phase !== "processing") return;
    if (activeStep >= pipelineSteps.length) {
      const t = setTimeout(() => setPhase("done"), 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setActiveStep((s) => s + 1), 850);
    return () => clearTimeout(t);
  }, [phase, activeStep]);

  function startProcessing(name: string) {
    setFileName(name);
    setActiveStep(0);
    setPhase("processing");
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    startProcessing(f ? f.name : "meeting-recording.mp4");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Upload a meeting"
        subtitle="Drop an audio, video, or transcript file and MeetOps will turn it into structured records."
      />

      {phase === "idle" && (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`card flex cursor-pointer flex-col items-center justify-center px-6 py-16 text-center transition ${
              dragOver ? "border-brand-400 bg-brand-50/50" : "border-slate-200"
            }`}
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <UploadCloud className="h-8 w-8" />
            </div>
            <div className="text-base font-semibold text-slate-800">
              Drag & drop your meeting file here
            </div>
            <div className="mt-1 text-sm text-slate-400">
              or click to browse — MP4, MOV, MP3, WAV, TXT, VTT
            </div>
            <button className="btn-primary mt-6">Select file</button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".mp4,.mov,.mp3,.wav,.m4a,.txt,.vtt,.srt"
              onChange={(e) =>
                startProcessing(e.target.files?.[0]?.name ?? "meeting.mp4")
              }
            />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4">
            {[
              { icon: FileVideo, label: "Video", hint: "MP4 · MOV" },
              { icon: FileAudio, label: "Audio", hint: "MP3 · WAV · M4A" },
              { icon: FileText, label: "Transcript", hint: "TXT · VTT · SRT" },
            ].map(({ icon: Icon, label, hint }) => (
              <div key={label} className="card flex items-center gap-3 p-4">
                <Icon className="h-6 w-6 text-brand-500" />
                <div>
                  <div className="text-sm font-semibold text-slate-700">
                    {label}
                  </div>
                  <div className="text-xs text-slate-400">{hint}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {phase !== "idle" && (
        <div className="card p-6">
          <div className="mb-6 flex items-center gap-3">
            <FileVideo className="h-8 w-8 text-brand-500" />
            <div>
              <div className="font-semibold text-slate-800">{fileName}</div>
              <div className="text-xs text-slate-400">
                {phase === "done"
                  ? "Processing complete"
                  : "Processing through the MeetOps pipeline…"}
              </div>
            </div>
          </div>

          <ol className="space-y-3">
            {pipelineSteps.map((step, i) => {
              const done = i < activeStep || phase === "done";
              const active = i === activeStep && phase === "processing";
              return (
                <li key={step} className="flex items-center gap-3">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      done
                        ? "bg-emerald-100 text-emerald-600"
                        : active
                        ? "bg-brand-100 text-brand-600"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {done ? (
                      <Check className="h-4 w-4" />
                    ) : active ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span
                    className={`text-sm ${
                      done || active
                        ? "font-medium text-slate-800"
                        : "text-slate-400"
                    }`}
                  >
                    {step}
                  </span>
                </li>
              );
            })}
          </ol>

          {phase === "done" && (
            <div className="mt-6 flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3">
              <div className="text-sm font-medium text-emerald-700">
                Extracted 6 tasks, 3 decisions, and 2 risks.
              </div>
              <button
                className="btn-primary"
                onClick={() => navigate("/meetings/m1")}
              >
                View results
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
