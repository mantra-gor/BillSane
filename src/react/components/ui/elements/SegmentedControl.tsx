export interface Segment<T extends string> {
  value: T;
  label: string;
  /** Shown on hover — spell out abbreviated labels like "7D". */
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  /** Inverted palette, for use on the dark shell. */
  onDark?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * A compact exclusive choice — date ranges, view modes, filters. Arrow keys
 * move between options the way a native radio group does.
 */
function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  size = "md",
  onDark = false,
  className = "",
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  const itemSize =
    size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]";

  const track = onDark
    ? "bg-shell-raised border-shell-border"
    : "bg-surface-muted border-line";

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? 1 : -1;
    const next = (index + delta + segments.length) % segments.length;
    onChange(segments[next].value);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-0.5 rounded-xl border p-1 ${track} ${className}`}>
      {segments.map((segment, index) => {
        const selected = segment.value === value;
        const selectedStyle = onDark
          ? "bg-munsell_blue text-white shadow-accent"
          : "bg-surface text-ink shadow-xs";
        const idleStyle = onDark
          ? "text-white/55 hover:text-white hover:bg-white/5"
          : "text-ink-muted hover:text-ink hover:bg-surface";

        return (
          <button
            key={segment.value}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            title={segment.title}
            onKeyDown={(e) => onKeyDown(e, index)}
            onClick={() => onChange(segment.value)}
            className={`cursor-pointer rounded-lg font-semibold transition-all duration-150 ease-snap ${itemSize} ${
              selected ? selectedStyle : idleStyle
            }`}>
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
