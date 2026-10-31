import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, Eye, EyeOff, Gavel, ListChecks, Loader2, Lock, Mail, RefreshCw, ServerOff, ShieldAlert } from "lucide-react";
import { ApiError } from "../api/client";
import { api } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import illustration from "../assets/meeting-illustration.jpg";
import { Field } from "../components/ui";
import { useAccent } from "../hooks/useTheme";

// The illustration's own background colour, so the picture blends into the panel.
const ART_BG = "#e1f3f7";

const FEATURES = [
  { icon: <ListChecks className="h-4 w-4" />, text: "Tasks with owners and due dates" },
  { icon: <Gavel className="h-4 w-4" />, text: "A decision register, kept for you" },
  { icon: <ShieldAlert className="h-4 w-4" />, text: "Risks flagged, even when they come back" },
];

function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-[13px] font-bold text-accent-fg shadow-sm">M</div>
      <span className={`text-[16px] font-semibold tracking-tight ${light ? "text-slate-800" : "text-fg"}`}>MeetOps</span>
    </div>
  );
}

function ArtPanel() {
  // The panel is always light, so it uses the light version of the accent even in dark mode
  // (the dark accent rules only apply to <html>, a data-accent on this element resets them).
  const [accent] = useAccent();
  return (
    <aside data-accent={accent} className="relative hidden flex-col overflow-hidden lg:flex lg:w-[54%] xl:w-[58%]" style={{ background: ART_BG }}>
      <div className="relative z-10 px-12 pt-10 xl:px-16">
        <Logo light />
        <h2 className="mt-12 max-w-[520px] text-[34px] font-semibold leading-[1.15] tracking-tight text-slate-900 xl:text-[40px]">
          Every meeting, <span className="text-accent-text">turned into action.</span>
        </h2>
        <p className="mt-4 max-w-[460px] text-[15px] leading-relaxed text-slate-600">
          MeetOps reads your meeting transcripts and keeps the tasks, decisions and risks in one place, each linked to the moment it was said.
        </p>
        <ul className="mt-7 space-y-2.5">
          {FEATURES.map((f) => (
            <li key={f.text} className="flex items-center gap-2.5 text-[14px] font-medium text-slate-700">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-accent-text shadow-sm">{f.icon}</span>
              {f.text}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative mt-auto">
        <img src={illustration} alt="A team meeting around a table, with ideas and actions above them" className="block w-full select-none object-contain" draggable={false} />
      </div>
    </aside>
  );
}

function MobileArt() {
  return (
    <div className="overflow-hidden rounded-xl lg:hidden" style={{ background: ART_BG }}>
      <img src={illustration} alt="" className="block h-36 w-full object-cover object-bottom sm:h-44" draggable={false} />
    </div>
  );
}

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-full bg-canvas">
      <ArtPanel />
      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[400px] animate-fade-in">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <div className="mb-6 lg:hidden">
            <MobileArt />
          </div>
          <h1 className="text-[26px] font-semibold tracking-tight text-fg">{title}</h1>
          <p className="mb-7 mt-1.5 text-[14px] leading-relaxed text-muted">{subtitle}</p>
          {children}
          {footer && <div className="mt-8 border-t border-line pt-5 text-[12px] text-faint">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

function IconInput({ icon, ...props }: { icon: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">{icon}</span>
      <input {...props} className="field h-10 pl-9 text-[14px]" />
    </div>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <input {...props} type={show ? "text" : "password"} className="field h-10 pl-9 pr-10 text-[14px]" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-fg"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  return <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-700 dark:text-red-300">{text}</div>;
}

function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Something went wrong. Please try again.";
}

const FOOTER = "MeetOps · Intelligent Enterprise Meeting Management";

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
    <AuthLayout title="Welcome back" subtitle="Sign in to see your tasks, decisions and risks." footer={<>Accounts are created by your administrator. {FOOTER}</>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Work email">
          <IconInput icon={<Mail className="h-4 w-4" />} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" autoFocus />
        </Field>
        <Field label="Password">
          <PasswordInput autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
        </Field>
        <ErrorNote text={error} />
        <button className="btn-primary h-10 w-full text-[14px]" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Sign in {!busy && <ArrowRight className="h-4 w-4" />}
        </button>
      </form>
    </AuthLayout>
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
    <AuthLayout
      title="Set up your workspace"
      subtitle="Create the first administrator account. You can add departments and colleagues afterwards."
      footer={
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-accent" /> This screen appears only once, on a new installation.
        </span>
      }
    >
      <form onSubmit={submit} className="space-y-3.5">
        <Field label="Full name">
          <input className="field h-10 text-[14px]" required minLength={2} value={form.name} onChange={set("name")} autoFocus />
        </Field>
        <Field label="Work email">
          <IconInput icon={<Mail className="h-4 w-4" />} type="email" required value={form.email} onChange={set("email")} placeholder="name@company.com" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department">
            <input className="field h-10 text-[14px]" required minLength={2} value={form.department} onChange={set("department")} />
          </Field>
          <Field label="Job title (optional)">
            <input className="field h-10 text-[14px]" value={form.title} onChange={set("title")} />
          </Field>
        </div>
        <Field label="Password" hint="At least 8 characters.">
          <PasswordInput autoComplete="new-password" required minLength={8} value={form.password} onChange={set("password")} />
        </Field>
        <Field label="Confirm password">
          <PasswordInput autoComplete="new-password" required minLength={8} value={form.confirm} onChange={set("confirm")} />
        </Field>
        <ErrorNote text={error} />
        <button className="btn-primary h-10 w-full text-[14px]" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create workspace {!busy && <ArrowRight className="h-4 w-4" />}
        </button>
      </form>
    </AuthLayout>
  );
}

export function OfflineScreen() {
  const { retry } = useAuth();
  return (
    <AuthLayout title="Cannot reach the server" subtitle="MeetOps only shows real data from its backend, so the API needs to be running.">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <ServerOff className="h-4 w-4" /> Start the backend, then try again:
        </div>
        <pre className="overflow-x-auto rounded-lg border border-line bg-subtle p-3.5 font-mono text-[12px] leading-relaxed text-fg">cd backend{"\n"}python -m uvicorn app.main:app --reload --port 8000</pre>
        <button className="btn-primary h-10 w-full text-[14px]" onClick={retry}>
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </div>
    </AuthLayout>
  );
}

export function SplashScreen() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-faint" />
    </div>
  );
}
