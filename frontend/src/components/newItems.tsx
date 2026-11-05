// Add a decision or a risk by hand: one the model missed, linked to its meeting and, when added
// from a transcript line, to that line (the line is then saved as training feedback).
import { useState, type FormEvent } from "react";
import { api } from "../api/endpoints";
import { useMutation } from "../hooks/useMutation";
import type { Meeting, RiskSeverity } from "../types";
import { useUsers } from "./items";
import { Dialog, Field, formatDate } from "./ui";

const DECISION_REFRESH = ["decisions", "insights", "review", "meetings", "activity"];
const RISK_REFRESH = ["risks", "insights", "review", "meetings", "activity", "notifications"];

function MeetingSelect({ meetings, value, locked, onChange }: { meetings: Meeting[]; value: number; locked: boolean; onChange: (id: number) => void }) {
  return (
    <Field label="Meeting">
      <select className="field" value={value} onChange={(e) => onChange(Number(e.target.value))} disabled={locked}>
        {meetings.map((m) => (
          <option key={m.id} value={m.id}>
            {m.title} · {formatDate(m.date)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function OwnerSelect({ value, empty, onChange }: { value: number; empty: string; onChange: (id: number) => void }) {
  const users = useUsers();
  return (
    <Field label="Owner">
      <select className="field" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={0}>{empty}</option>
        {(users.data ?? []).map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function NewDecisionDialog({ open, onClose, meetings, defaultMeetingId, segmentId, defaultText = "" }: { open: boolean; onClose: () => void; meetings: Meeting[]; defaultMeetingId?: number; segmentId?: number; defaultText?: string }) {
  const { run, busy } = useMutation();
  const [form, setForm] = useState({ statement: defaultText, meetingId: defaultMeetingId ?? meetings[0]?.id ?? 0, ownerId: 0 });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const created = await run(
      () => api.createDecision({ statement: form.statement.trim(), meetingId: form.meetingId, ownerId: form.ownerId || null, segmentId }),
      { success: "Decision added", refresh: DECISION_REFRESH }
    );
    if (created) onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New decision"
      description="Add an agreed outcome the system missed."
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" form="new-decision" disabled={busy || form.statement.trim().length < 3 || !form.meetingId}>
            Add decision
          </button>
        </>
      }
    >
      <form id="new-decision" onSubmit={submit} className="space-y-3">
        <Field label="What was decided">
          <textarea className="field" rows={2} value={form.statement} onChange={(e) => setForm({ ...form, statement: e.target.value })} autoFocus required minLength={3} />
        </Field>
        <MeetingSelect meetings={meetings} value={form.meetingId} locked={!!defaultMeetingId} onChange={(id) => setForm({ ...form, meetingId: id })} />
        <OwnerSelect value={form.ownerId} empty="Not recorded" onChange={(id) => setForm({ ...form, ownerId: id })} />
      </form>
    </Dialog>
  );
}

export function NewRiskDialog({ open, onClose, meetings, defaultMeetingId, segmentId, defaultText = "" }: { open: boolean; onClose: () => void; meetings: Meeting[]; defaultMeetingId?: number; segmentId?: number; defaultText?: string }) {
  const { run, busy } = useMutation();
  const [form, setForm] = useState({ description: defaultText, meetingId: defaultMeetingId ?? meetings[0]?.id ?? 0, ownerId: 0, severity: "Medium" as RiskSeverity });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const created = await run(
      () => api.createRisk({ description: form.description.trim(), meetingId: form.meetingId, severity: form.severity, ownerId: form.ownerId || null, segmentId }),
      { success: "Risk added", refresh: RISK_REFRESH }
    );
    if (created) onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New risk"
      description="Add a concern the system missed."
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" form="new-risk" disabled={busy || form.description.trim().length < 3 || !form.meetingId}>
            Add risk
          </button>
        </>
      }
    >
      <form id="new-risk" onSubmit={submit} className="space-y-3">
        <Field label="What could go wrong">
          <textarea className="field" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} autoFocus required minLength={3} />
        </Field>
        <MeetingSelect meetings={meetings} value={form.meetingId} locked={!!defaultMeetingId} onChange={(id) => setForm({ ...form, meetingId: id })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Severity">
            <select className="field" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as RiskSeverity })}>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </Field>
          <OwnerSelect value={form.ownerId} empty="No owner" onChange={(id) => setForm({ ...form, ownerId: id })} />
        </div>
      </form>
    </Dialog>
  );
}
