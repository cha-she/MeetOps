import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./client";

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
  // Replace the cached data locally (used for optimistic updates).
  setData: (updater: (prev: T | undefined) => T | undefined) => void;
}

interface Result<T> {
  token: string; // which request this result belongs to
  data?: T;
  error?: ApiError;
}

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError(err instanceof Error ? err.message : "Unknown error", -1);
}

// ---------------------------------------------------------------------------
// Invalidation: after a change, call invalidate("tasks") and every mounted
// query whose key starts with "tasks" fetches again, so all screens agree.
// ---------------------------------------------------------------------------
const subscribers = new Set<{ key: string; reload: () => void }>();

export function invalidate(...prefixes: string[]) {
  subscribers.forEach((s) => {
    if (prefixes.length === 0 || prefixes.some((p) => s.key.startsWith(p))) s.reload();
  });
}

interface Options {
  refreshMs?: number; // poll in the background (lists use this to show changes made elsewhere)
  enabled?: boolean;
}

// Small data-fetching hook. `key` identifies the request; when it changes (or
// reload() is called) the request runs again. Previous data stays visible
// while a reload is in flight, so the UI does not flash empty. Background
// refreshes (polling, window focus, invalidate) never show a loading state.
export function useQuery<T>(key: string, fetcher: () => Promise<T>, options: Options = {}): QueryState<T> {
  const { refreshMs, enabled = true } = options;
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const [version, setVersion] = useState(0);
  const token = `${key}#${version}`;
  const [result, setResult] = useState<Result<T>>({ token: "" });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetcherRef
      .current()
      .then((data) => {
        if (alive) setResult({ token, data });
      })
      .catch((err: unknown) => {
        if (alive) setResult((prev) => ({ token, data: prev.data, error: toApiError(err) }));
      });
    return () => {
      alive = false;
    };
  }, [token, enabled]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const sub = { key, reload };
    subscribers.add(sub);
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    const timer = refreshMs ? window.setInterval(reload, refreshMs) : undefined;
    return () => {
      subscribers.delete(sub);
      window.removeEventListener("focus", onFocus);
      if (timer) window.clearInterval(timer);
    };
  }, [key, reload, refreshMs]);

  const setData = useCallback(
    (updater: (prev: T | undefined) => T | undefined) => setResult((prev) => ({ ...prev, data: updater(prev.data) })),
    []
  );

  const sameKey = result.token.split("#")[0] === key;
  const settled = result.token === token;
  return {
    data: sameKey ? result.data : undefined,
    // only a first load (or a new key) counts as loading; refreshes keep showing data
    loading: enabled && !settled && !(sameKey && result.data !== undefined),
    error: settled ? result.error ?? null : null,
    reload,
    setData,
  };
}
