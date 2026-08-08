import React from "react";
import { FiLoader } from "react-icons/fi";

export type ButtonVariant =
  | "primary"
  | "accent"
  | "secondary"
  | "ghost"
  | "danger"
  | "subtle";

export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  /** Rendered before the label. Hidden while `loading` (the spinner takes its place). */
  icon?: React.ReactNode;
  /** Rendered after the label — shortcut hints, chevrons, counts. */
  trailing?: React.ReactNode;
  children?: React.ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-prussian_blue text-white shadow-brand hover:bg-prussian_blue-800 active:bg-prussian_blue-900",
  accent:
    "bg-munsell_blue text-white shadow-accent hover:bg-munsell_blue-600 active:bg-munsell_blue-700",
  secondary:
    "bg-surface text-ink border border-line shadow-xs hover:bg-surface-subtle hover:border-line-strong active:bg-surface-muted",
  ghost: "bg-transparent text-ink-soft hover:bg-surface-muted active:bg-surface-sunken",
  danger:
    "bg-danger text-white shadow-xs hover:brightness-95 active:brightness-90",
  subtle:
    "bg-danger-soft text-danger-ink border border-danger-border hover:bg-danger-soft hover:brightness-[0.97]",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-xl",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      type = "button",
      variant = "primary",
      size = "md",
      loading = false,
      fullWidth = false,
      disabled = false,
      icon,
      trailing,
      className = "",
      children,
      ...rest
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={`inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap font-semibold
          transition-all duration-150 ease-snap
          disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none
          ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? "w-full" : ""} ${className}`}
        {...rest}>
        {loading ? (
          <FiLoader className="animate-spin" size={size === "sm" ? 14 : 16} />
        ) : (
          icon
        )}
        {children}
        {trailing}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
