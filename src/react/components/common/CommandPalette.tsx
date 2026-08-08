import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { FiCornerDownLeft, FiFileText, FiSearch } from "react-icons/fi";
import {
  NAV_GROUPS,
  SETTINGS_TABS,
  type NavItem,
} from "../../router/navigation";
import { getInvoices, type SavedInvoice } from "../../utils/invoiceStore";
import { formatINR } from "../../utils/format";
import { MOD_KEY } from "../../hooks/usePlatform";

interface CommandPaletteProps {
  onClose: () => void;
}

interface Command {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  icon: NavItem["icon"];
  /** Extra text folded into the match, never displayed. */
  haystack: string;
  run: () => void;
}

const MAX_INVOICE_RESULTS = 6;

/**
 * ⌘K launcher. Navigation is always available; invoices are pulled in on mount
 * so a keyboard user can jump straight to a bill by number, customer name or
 * phone.
 *
 * Only mounted while open — that way every launch starts with a blank query and
 * the cursor at the top, with no reset effect to keep in sync.
 */
function CommandPalette({ onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [invoices, setInvoices] = useState<SavedInvoice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    getInvoices()
      .then((data) => {
        if (!cancelled) {
          setInvoices(data);
          setLoaded(true);
        }
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      navigate(path);
      onClose();
    };

    const navCommands: Command[] = [
      ...NAV_GROUPS.flatMap((group) =>
        group.items.map((item) => ({
          id: `nav:${item.path}`,
          title: item.title,
          subtitle: item.description,
          group: "Go to",
          icon: item.icon,
          haystack: [item.title, item.description, ...(item.keywords ?? [])]
            .join(" ")
            .toLowerCase(),
          run: go(item.path),
        }))
      ),
      ...SETTINGS_TABS.map((item) => ({
        id: `nav:${item.path}`,
        title: `Settings · ${item.title}`,
        subtitle: item.description,
        group: "Settings",
        icon: item.icon,
        haystack: [item.title, item.description, ...(item.keywords ?? [])]
          .join(" ")
          .toLowerCase(),
        run: go(item.path),
      })),
    ];

    const invoiceCommands: Command[] = invoices.map((invoice) => ({
      id: `invoice:${invoice.id}`,
      title: `${invoice.invoiceNo} · ${invoice.customerDetails?.name ?? "Unknown"}`,
      subtitle: `${invoice.date} · ${formatINR(invoice.totalAmount ?? 0)}`,
      group: "Invoices",
      icon: FiFileText,
      haystack: [
        invoice.invoiceNo,
        invoice.customerDetails?.name,
        invoice.customerDetails?.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      run: () => {
        navigate(`/invoice/view/${invoice.id}`);
        onClose();
      },
    }));

    return [...navCommands, ...invoiceCommands];
  }, [invoices, navigate, onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    // With no query, show navigation only — a dump of every invoice is noise.
    if (!q) return commands.filter((c) => c.group !== "Invoices");

    const matched = commands.filter((c) =>
      q.split(/\s+/).every((term) => c.haystack.includes(term))
    );

    // Cap invoices so navigation never gets pushed off the list.
    const invoiceHits = matched.filter((c) => c.group === "Invoices");
    return [
      ...matched.filter((c) => c.group !== "Invoices"),
      ...invoiceHits.slice(0, MAX_INVOICE_RESULTS),
    ];
  }, [commands, query]);

  // Derived rather than stored: when the result set shrinks under the cursor,
  // clamping here avoids writing state back out of an effect.
  const cursor = active >= results.length ? 0 : active;

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((prev) => (prev + 1) % Math.max(results.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(
        (prev) => (prev - 1 + results.length) % Math.max(results.length, 1)
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[cursor]?.run();
    }
  };

  // Group headings are rendered inline, ahead of the first row of each group.
  let lastGroup = "";

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]">
      <div
        className="absolute inset-0 animate-fade-in bg-shell/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
        className="relative z-10 w-full max-w-xl animate-scale-in overflow-hidden rounded-2xl border border-line bg-surface shadow-overlay">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <FiSearch size={17} className="shrink-0 text-ink-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search screens, settings, invoices…"
            aria-label="Search"
            className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
          />
          <kbd className="kbd shrink-0">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-ink-muted">
              No matches for “{query}”
            </p>
          ) : (
            results.map((command, index) => {
              const showGroup = command.group !== lastGroup;
              lastGroup = command.group;
              const selected = index === cursor;

              return (
                <div key={command.id}>
                  {showGroup && (
                    <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint">
                      {command.group}
                    </p>
                  )}
                  <button
                    type="button"
                    data-index={index}
                    onMouseEnter={() => setActive(index)}
                    onClick={command.run}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      selected ? "bg-munsell_blue-5" : "hover:bg-surface-subtle"
                    }`}>
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        selected
                          ? "bg-munsell_blue text-white"
                          : "bg-surface-muted text-ink-muted"
                      }`}>
                      <command.icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {command.title}
                      </span>
                      {command.subtitle && (
                        <span className="block truncate text-xs text-ink-muted">
                          {command.subtitle}
                        </span>
                      )}
                    </span>
                    {selected && (
                      <FiCornerDownLeft
                        size={14}
                        className="shrink-0 text-munsell_blue"
                      />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-line bg-surface-subtle px-4 py-2.5 text-[11px] text-ink-muted">
          <span className="flex items-center gap-1.5">
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="kbd">↵</kbd>
            open
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <kbd className="kbd">{MOD_KEY}K</kbd>
            toggle
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default CommandPalette;
