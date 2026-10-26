// Application-level configuration.

// Base URL of the FastAPI backend. In development Vite proxies "/api" to
// http://localhost:8000 (see vite.config.ts), so no value is needed locally.
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "/api";

// Force the built-in demo dataset even when a backend is available.
export const DEMO_MODE: boolean =
  String(import.meta.env.VITE_DEMO_MODE ?? "").toLowerCase() === "true";

// The signed-in user. Authentication and role-based access control are
// planned for semester 2; until then the dashboard runs as this account.
export const CURRENT_USER = {
  name: "Chanya Shehani",
  initials: "CS",
  role: "Admin",
};

// How often (ms) the upload screen polls a meeting while it is processing.
export const PIPELINE_POLL_INTERVAL_MS = 1500;
