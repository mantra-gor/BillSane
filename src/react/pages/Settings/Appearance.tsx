import { useState } from "react";
import Card from "../../components/ui/elements/Card";
import { useToast } from "../../components/ui/feedback/toastContext";

const COLLAPSE_KEY = "sidebarCollapsed";

const PALETTE = [
  { name: "Prussian Blue", role: "Primary actions, shell", hex: "#053247" },
  { name: "Munsell Blue", role: "Accent, focus, selection", hex: "#298E9E" },
  { name: "Ink", role: "Body text", hex: "#0C2231" },
  { name: "Canvas", role: "App background", hex: "#F1F5F9" },
  { name: "Success", role: "Positive states", hex: "#0E9F6E" },
  { name: "Danger", role: "Destructive states", hex: "#DC2B2B" },
];

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start justify-between gap-4 rounded-xl border border-line p-4 transition-colors ${
        disabled ? "opacity-60" : "cursor-pointer hover:bg-surface-subtle"
      }`}>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="mt-0.5 block text-sm leading-relaxed text-ink-muted">
          {description}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          disabled ? "cursor-not-allowed" : "cursor-pointer"
        } ${checked ? "bg-munsell_blue" : "bg-surface-sunken"}`}>
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-xs transition-transform duration-200 ease-snap ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

function Appearance() {
  const toast = useToast();
  const [collapsedByDefault, setCollapsedByDefault] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === "true"
  );

  const updateCollapsed = (next: boolean) => {
    setCollapsedByDefault(next);
    localStorage.setItem(COLLAPSE_KEY, String(next));
    toast.success(
      next ? "Sidebar starts collapsed" : "Sidebar starts expanded",
      "Applies the next time you open BillSane."
    );
  };

  return (
    <div className="space-y-5">
      <Card title="Layout" subtitle="Defaults applied when the app starts.">
        <Toggle
          checked={collapsedByDefault}
          onChange={updateCollapsed}
          label="Start with the sidebar collapsed"
          description="Gives screens more horizontal room. You can always toggle it with ⌘B / Ctrl+B."
        />
      </Card>

      <Card
        title="Brand palette"
        subtitle="The tokens every screen is built from.">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PALETTE.map((swatch) => (
            <li
              key={swatch.hex}
              className="flex items-center gap-3 rounded-xl border border-line p-3">
              <span
                className="h-10 w-10 shrink-0 rounded-lg border border-line shadow-inset"
                style={{ backgroundColor: swatch.hex }}
              />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-ink">
                  {swatch.name}
                </span>
                <span className="block truncate text-xs text-ink-muted">
                  {swatch.role}
                </span>
                <span className="block font-numeric text-[11px] uppercase text-ink-faint">
                  {swatch.hex}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export default Appearance;
