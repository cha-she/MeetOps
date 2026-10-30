// Application-level configuration.

// Base URL of the FastAPI backend. In development Vite proxies "/api" to
// http://localhost:8000 (see vite.config.ts), so no value is needed locally.
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "/api";

// How often (ms) the upload screen polls a meeting while it is processing.
export const PIPELINE_POLL_INTERVAL_MS = 1500;

// How often (ms) open lists refresh themselves so changes made elsewhere appear.
export const LIST_REFRESH_INTERVAL_MS = 20000;

export const APP_NAME = "MeetOps";
