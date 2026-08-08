import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiInfo,
  FiX,
  FiXCircle,
} from "react-icons/fi";
import {
  ToastContext,
  type Toast,
  type ToastApi,
  type ToastInput,
  type ToastTone,
} from "./toastContext";

const AUTO_DISMISS_MS = 4000;

const TONE_STYLES: Record<
  ToastTone,
  { icon: typeof FiCheckCircle; accent: string; iconColor: string }
> = {
  success: {
    icon: FiCheckCircle,
    accent: "bg-success",
    iconColor: "text-success",
  },
  error: { icon: FiXCircle, accent: "bg-danger", iconColor: "text-danger" },
  warning: {
    icon: FiAlertTriangle,
    accent: "bg-warning",
    iconColor: "text-warning",
  },
  info: { icon: FiInfo, accent: "bg-info", iconColor: "text-info" },
};

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const { icon: Icon, accent, iconColor } = TONE_STYLES[toast.tone];

  return (
    <div
      role="status"
      className="pointer-events-auto flex w-80 animate-slide-in-right items-start gap-3 overflow-hidden rounded-xl border border-line bg-surface p-3.5 pl-4 shadow-overlay">
      <span className={`absolute left-0 top-0 h-full w-1 ${accent}`} />
      <Icon size={18} className={`mt-px shrink-0 ${iconColor}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 break-words text-xs leading-relaxed text-ink-muted">
            {toast.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="-mr-1 -mt-1 shrink-0 cursor-pointer rounded-md p-1 text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink">
        <FiX size={14} />
      </button>
    </div>
  );
}

/**
 * App-wide transient feedback. Replaces the inline "Saved successfully" spans
 * that used to sit next to each form's submit button — feedback now appears in
 * one predictable place regardless of which screen raised it.
 */
function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    ({ tone = "info", title, description }: ToastInput) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, tone, title, description }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      dismiss,
      success: (title, description) =>
        push({ tone: "success", title, description }),
      error: (title, description) => push({ tone: "error", title, description }),
      info: (title, description) => push({ tone: "info", title, description }),
      warning: (title, description) =>
        push({ tone: "warning", title, description }),
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col-reverse gap-2.5">
          {toasts.map((toast) => (
            <div key={toast.id} className="relative">
              <ToastCard toast={toast} onDismiss={() => dismiss(toast.id)} />
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export default ToastProvider;
