import { useCallback, useState } from "react";
import { invalidate } from "../api/hooks";
import { useToast } from "../components/toast";

// Run a change against the API, show a toast, and refresh every screen that
// shows the affected data (invalidate by key prefix).
export function useMutation() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T>(fn: () => Promise<T>, opts: { success?: string; refresh?: string[]; undo?: () => Promise<unknown> } = {}): Promise<T | undefined> => {
      setBusy(true);
      try {
        const result = await fn();
        invalidate(...(opts.refresh ?? []));
        if (opts.success) {
          const undo = opts.undo;
          toast.success(
            opts.success,
            undo
              ? {
                  label: "Undo",
                  onClick: () => {
                    undo().then(() => invalidate(...(opts.refresh ?? [])));
                  },
                }
              : undefined
          );
        }
        return result;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save the change.");
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast]
  );

  return { run, busy };
}
