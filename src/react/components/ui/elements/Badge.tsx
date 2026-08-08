import React from "react";

export type BadgeTone =
  | "neutral"
  | "brand"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info";

interface BadgeProps {
  tone?: BadgeTone;
  /** Adds a leading dot — useful for status ("Paid", "Draft") without an icon. */
  dot?: boolean;
  icon?: React.ReactNode;
  size?: "sm" | "md";
  className?: string;
  children: React.ReactNode;
}

const TONES: Record<BadgeTone, { chip: string; dot: string }> = {
  neutral: {
    chip: "bg-surface-muted text-ink-soft border-line",
    dot: "bg-ink-faint",
  },
  brand: {
    chip: "bg-prussian_blue-5 text-prussian_blue border-prussian_blue-25",
    dot: "bg-prussian_blue",
  },
  accent: {
    chip: "bg-munsell_blue-5 text-munsell_blue-700 border-munsell_blue-50",
    dot: "bg-munsell_blue",
  },
  success: {
    chip: "bg-success-soft text-success-ink border-success-border",
    dot: "bg-success",
  },
  warning: {
    chip: "bg-warning-soft text-warning-ink border-warning-border",
    dot: "bg-warning",
  },
  danger: {
    chip: "bg-danger-soft text-danger-ink border-danger-border",
    dot: "bg-danger",
  },
  info: {
    chip: "bg-info-soft text-info-ink border-info-border",
    dot: "bg-info",
  },
};

function Badge({
  tone = "neutral",
  dot = false,
  icon,
  size = "md",
  className = "",
  children,
}: BadgeProps) {
  const { chip, dot: dotColor } = TONES[tone];
  const sizing =
    size === "sm"
      ? "h-5 px-1.5 text-[10px] gap-1"
      : "h-6 px-2 text-[11px] gap-1.5";

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border font-semibold ${chip} ${sizing} ${className}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />}
      {icon}
      {children}
    </span>
  );
}

export default Badge;
