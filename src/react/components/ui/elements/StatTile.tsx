import type { ComponentType } from "react";
import { FiArrowDownRight, FiArrowUpRight, FiMinus } from "react-icons/fi";

export type StatTone = "brand" | "accent" | "success" | "warning" | "info";

interface StatTileProps {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  /**
   * % change vs. the previous period. `undefined`/`null` hides the badge (no
   * comparable prior window); `0` renders a neutral "no change" chip.
   */
  delta?: number | null;
  /** Caption under the value — "vs previous 30 days", a secondary figure. */
  caption?: string;
  tone?: StatTone;
  /** Turns the whole tile into a button. */
  onClick?: () => void;
}

const TONES: Record<StatTone, string> = {
  brand: "bg-prussian_blue text-white",
  accent: "bg-munsell_blue text-white",
  success: "bg-success text-white",
  warning: "bg-warning text-white",
  info: "bg-info text-white",
};

function DeltaBadge({ delta }: { delta: number }) {
  const up = delta > 0;
  const flat = delta === 0;
  const tone = flat
    ? "bg-surface-muted text-ink-muted"
    : up
      ? "bg-success-soft text-success-ink"
      : "bg-danger-soft text-danger-ink";
  const Arrow = flat ? FiMinus : up ? FiArrowUpRight : FiArrowDownRight;

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold tnum ${tone}`}
      title={
        flat ? "No change vs. previous period" : "Change vs. previous period"
      }>
      <Arrow size={11} />
      {Math.abs(delta)}%
    </span>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  delta,
  caption,
  tone = "brand",
  onClick,
}: StatTileProps) {
  const interactive = Boolean(onClick);

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={`card group relative overflow-hidden p-4 ${
        interactive ? "card-interactive cursor-pointer" : ""
      }`}>
      {/* Faint brand wash in the corner — depth without another border. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-munsell_blue/[0.06] transition-transform duration-500 ease-snap group-hover:scale-125"
      />

      <div className="relative flex items-start gap-3.5">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-xs ${TONES[tone]}`}>
          <Icon size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold uppercase tracking-[0.07em] text-ink-muted">
            {label}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <p className="truncate text-[22px] font-bold leading-none text-ink tnum">
              {value}
            </p>
            {delta != null && <DeltaBadge delta={delta} />}
          </div>
          {caption && (
            <p className="mt-1.5 truncate text-xs text-ink-faint">{caption}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default StatTile;
