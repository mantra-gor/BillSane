import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Footer actions, right-aligned. */
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** Hides the X — for flows the user must resolve with an explicit choice. */
  hideClose?: boolean;
  children?: React.ReactNode;
}

const SIZES = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
};

function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  size = "sm",
  hideClose = false,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc closes, Tab is trapped inside the panel, and focus moves in on open —
  // a dialog you can't reach or leave from the keyboard is a broken dialog.
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Defer so the panel is mounted before we reach into it.
    const timer = window.setTimeout(() => {
      const items = focusables();
      (items[0] ?? panelRef.current)?.focus();
    }, 0);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      window.clearTimeout(timer);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-shell/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`relative z-10 w-full animate-scale-in rounded-2xl border border-line bg-surface shadow-overlay ${SIZES[size]}`}>
        {(title || !hideClose) && (
          <header className="flex items-start justify-between gap-4 px-6 pt-5">
            <div className="min-w-0">
              {title && (
                <h2 className="text-base font-semibold text-ink">{title}</h2>
              )}
              {description && (
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  {description}
                </p>
              )}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="-mr-1.5 -mt-1 shrink-0 cursor-pointer rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink">
                <FiX size={18} />
              </button>
            )}
          </header>
        )}

        {children && <div className="px-6 py-4">{children}</div>}

        {footer && (
          <footer className="flex items-center justify-end gap-2 rounded-b-2xl border-t border-line bg-surface-subtle px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}

export default Modal;
