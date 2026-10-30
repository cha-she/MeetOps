/* eslint-disable react-refresh/only-export-components -- provider and hook belong together */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

interface Toast {
  id: number;
  message: ReactNode;
  tone: "success" | "error";
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  success: (message: ReactNode, action?: Toast["action"]) => void;
  error: (message: ReactNode) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId++;
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.tone === "error" ? 6000 : 3500);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, action) => push({ message, tone: "success", action }),
      error: (message) => push({ message, tone: "error" }),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[340px] flex-col gap-2">
          {toasts.map((t) => (
            <div key={t.id} className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] text-fg shadow-pop animate-slide-in">
              {t.tone === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
              <div className="min-w-0 flex-1">{t.message}</div>
              {t.action && (
                <button
                  className="font-medium text-accent-text hover:underline"
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button className="text-faint hover:text-fg" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
