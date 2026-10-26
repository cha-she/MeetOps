import { API_BASE_URL } from "../config";

// Thin wrapper around fetch that talks to the MeetOps API and converts
// failures into readable errors for the UI.

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  // True when the backend could not be reached at all (not running, wrong URL).
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const url = `${API_BASE_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) {
      return body.detail.map((d: { msg?: string }) => d.msg ?? "").join(", ");
    }
  } catch {
    // not JSON
  }
  return `${res.status} ${res.statusText}`;
}

async function request<T>(
  method: string,
  path: string,
  options: { query?: Query; body?: unknown; formData?: FormData } = {}
): Promise<T> {
  const init: RequestInit = { method, headers: {} };

  if (options.formData) {
    init.body = options.formData; // browser sets the multipart boundary
  } else if (options.body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, options.query), init);
  } catch {
    throw new ApiError(
      "Cannot reach the MeetOps API. Make sure the backend server is running.",
      0
    );
  }

  if (!res.ok) throw new ApiError(await parseError(res), res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const http = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  del: <T>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, formData: FormData) =>
    request<T>("POST", path, { formData }),
};
