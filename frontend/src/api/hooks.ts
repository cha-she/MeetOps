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

// Small data-fetching hook. `key` identifies the request; when it changes (or
// reload() is called) the request is re-run. Previous data is kept visible
// while a reload is in flight so the UI does not flash empty.
export function useQuery<T>(key: string, fetcher: () => Promise<T>): QueryState<T> {
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const [version, setVersion] = useState(0);
  const token = `${key}#${version}`;
  const [result, setResult] = useState<Result<T>>({ token: "" });

  useEffect(() => {
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
  }, [token]);

  const settled = result.token === token;
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback(
    (updater: (prev: T | undefined) => T | undefined) =>
      setResult((prev) => ({ ...prev, data: updater(prev.data) })),
    []
  );

  return {
    data: result.data,
    loading: !settled,
    error: settled ? result.error ?? null : null,
    reload,
    setData,
  };
}
