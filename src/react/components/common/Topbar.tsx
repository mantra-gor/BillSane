import { useLocation, useNavigate } from "react-router";
import { FiPlus, FiSearch } from "react-icons/fi";
import Button from "../ui/elements/Button";
import { titleForPath } from "../../router/navigation";
import { MOD_KEY } from "../../hooks/usePlatform";

interface TopbarProps {
  onOpenCommandPalette: () => void;
}

/**
 * Persistent header: where you are on the left, what you can do next on the
 * right. The search field is a button, not an input — it opens the command
 * palette, which searches navigation and invoices together.
 */
function Topbar({ onOpenCommandPalette }: TopbarProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const title = titleForPath(pathname);
  const onInvoiceCreate = pathname.startsWith("/invoice-create");

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line bg-surface/85 px-6 backdrop-blur-md">
      <h1 className="shrink-0 text-[15px] font-bold tracking-tight text-ink">
        {title}
      </h1>

      <div className="ml-auto flex items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="group flex h-9 w-64 cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface-subtle px-3 text-left text-sm text-ink-faint shadow-xs transition-all duration-150 ease-snap hover:border-line-strong hover:bg-surface">
          <FiSearch size={15} className="shrink-0" />
          <span className="flex-1 truncate">Search or jump to…</span>
          <kbd className="kbd">{MOD_KEY}K</kbd>
        </button>

        {!onInvoiceCreate && (
          <Button
            size="sm"
            icon={<FiPlus size={15} />}
            onClick={() => navigate("/invoice-create")}
            title={`New invoice (${MOD_KEY}N)`}>
            New Invoice
          </Button>
        )}
      </div>
    </header>
  );
}

export default Topbar;
