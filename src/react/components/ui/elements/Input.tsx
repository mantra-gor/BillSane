import React from "react";

interface Props
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  name?: string;
  /** Marks the field red and wires up `aria-invalid` for the shared focus styles. */
  invalid?: boolean;
  /** Static adornment inside the left edge — a ₹, a search glyph, a unit. */
  prefix?: React.ReactNode;
  /** Static adornment inside the right edge — a %, a unit, a clear button. */
  suffix?: React.ReactNode;
  className?: string;
}

const Input = React.forwardRef<HTMLInputElement, Props>(
  ({ name, invalid = false, prefix, suffix, className = "", ...rest }, ref) => {
    const field = (
      <input
        ref={ref}
        name={name}
        id={rest.id ?? name}
        aria-invalid={invalid || undefined}
        className={`input-field ${prefix ? "pl-9" : ""} ${suffix ? "pr-9" : ""} ${className}`}
        {...rest}
      />
    );

    if (!prefix && !suffix) return field;

    return (
      <div className="relative w-full">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex w-9 items-center justify-center text-sm text-ink-faint">
            {prefix}
          </span>
        )}
        {field}
        {suffix && (
          <span className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-sm text-ink-faint">
            {suffix}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
