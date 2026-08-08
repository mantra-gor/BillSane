import React from "react";
import { FiAlertCircle } from "react-icons/fi";

interface FieldProps {
  /** Omit for controls that carry their own label (checkboxes, button groups). */
  label?: string;
  htmlFor?: string;
  required?: boolean;
  /** Helper copy shown under the control while there is no error. */
  hint?: string;
  /** `react-hook-form` hands back `string | undefined`; anything falsy hides the row. */
  error?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * The single label/hint/error frame every form control sits in. Centralising it
 * keeps vertical rhythm identical across Settings, invoice entry and auth — and
 * means an error never shifts the layout, because the message row is reserved
 * only when it has something to say.
 */
function Field({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  className = "",
  children,
}: FieldProps) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="text-[13px] font-semibold text-ink-soft">
          {label}
          {required && (
            <span className="ml-1 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-xs font-medium text-danger">
          <FiAlertCircle size={13} className="mt-px shrink-0" />
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-ink-muted">{hint}</p>
      )}
    </div>
  );
}

export default Field;
