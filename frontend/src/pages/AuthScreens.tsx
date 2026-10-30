import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Loader2, RefreshCw, ServerOff } from "lucide-react";
import { ApiError } from "../api/client";
import { api } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import { Field } from "../components/ui";

function Shell({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-[12px] font-bold text-white">M</div>
          <span className="text-[15px] font-semibold tracking-tight">MeetOps</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mb-6 mt-1 text-[13px] text-muted">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Something went wrong. Please try again.";
}

export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      signIn(await api.login(email.trim(), password));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Sign in" subtitle="Use the account your administrator created for you.">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email">
          <input className="field h-9" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Password">
          <input className="field h-9" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-300">{error}</div>}
        <button className="btn-primary h-9 w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Sign in
        </button>
      </form>
    </Shell>
  );
}

export function SetupScreen() {
  const { signIn } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", department: "Management", title: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      signIn(await api.setup({ name: form.name.trim(), email: form.email.trim(), password: form.password, department: form.department.trim(), title: form.title.trim() || undefined }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Set up your workspace" subtitle="Create the first administrator account. You can add departments and colleagues afterwards.">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Full name">
          <input className="field h-9" required minLength={2} value={form.name} onChange={set("name")} autoFocus />
        </Field>
        <Field label="Work email">
          <input className="field h-9" type="email" required value={form.email} onChange={set("email")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department">
            <input className="field h-9" required minLength={2} value={form.department} onChange={set("department")} />
          </Field>
          <Field label="Job title (optional)">
            <input className="field h-9" value={form.title} onChange={set("title")} />
          </Field>
        </div>
        <Field label="Password" hint="At least 8 characters.">
          <input className="field h-9" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={set("password")} />
        </Field>
        <Field label="Confirm password">
          <input className="field h-9" type="password" autoComplete="new-password" required minLength={8} value={form.confirm} onChange={set("confirm")} />
        </Field>
        {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-300">{error}</div>}
        <button className="btn-primary h-9 w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Create workspace
        </button>
      </form>
    </Shell>
  );
}

export function OfflineScreen() {
  const { retry } = useAuth();
  return (
    <Shell title="Cannot reach the MeetOps server" subtitle="The dashboard only shows real data from the backend, so it needs the API to be running.">
      <div className="panel space-y-3 p-4 text-[13px] text-muted">
        <div className="flex items-center gap-2 text-fg">
          <ServerOff className="h-4 w-4" /> Start the backend, then try again:
        </div>
        <pre className="overflow-x-auto rounded-md bg-subtle p-3 font-mono text-[12px] text-fg">cd backend{"\n"}python -m uvicorn app.main:app --reload --port 8000</pre>
        <button className="btn-primary w-full" onClick={retry}>
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </div>
    </Shell>
  );
}

export function SplashScreen() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-faint" />
    </div>
  );
}
