// PDF download buttons: the server builds the PDF (backend/app/services/reports.py) from the same
// data the page shows; the browser saves the file.
import { FileDown } from "lucide-react";
import { saveFile } from "../api/download";
import { api } from "../api/endpoints";
import { useMutation } from "../hooks/useMutation";

function PdfButton({ label, filename, fetchPdf, disabled = false, title }: { label: string; filename: string; fetchPdf: () => Promise<Blob>; disabled?: boolean; title?: string }) {
  const { run, busy } = useMutation();
  return (
    <button
      className="btn-secondary"
      disabled={disabled || busy}
      title={title}
      onClick={async () => {
        const blob = await run(fetchPdf, { refresh: ["activity"] });
        if (blob) saveFile(blob, filename);
      }}
    >
      <FileDown className="h-4 w-4" /> {busy ? "Preparing…" : label}
    </button>
  );
}

export function MeetingPdfButton({ meetingId, title }: { meetingId: number; title: string }) {
  return (
    <PdfButton
      label="Minutes PDF"
      title="Download the meeting minutes: summary, decisions, action items and risks"
      filename={`MeetOps minutes - ${title}.pdf`}
      fetchPdf={() => api.meetingPdf(meetingId)}
    />
  );
}

export function RegisterPdfButton({ kind, ids }: { kind: "tasks" | "decisions" | "risks"; ids: number[] }) {
  return (
    <PdfButton
      label="PDF"
      title="Download the rows shown (with the current filters) as a PDF"
      filename={`MeetOps ${kind}.pdf`}
      disabled={!ids.length}
      fetchPdf={() => api.registerPdf(kind, ids)}
    />
  );
}
