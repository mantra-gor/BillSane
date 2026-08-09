import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiDownload,
  FiFileText,
  FiRefreshCw,
  FiUploadCloud,
} from "react-icons/fi";
import Badge from "../ui/elements/Badge";
import Button from "../ui/elements/Button";
import Modal from "../ui/elements/Modal";
import SegmentedControl from "../ui/elements/SegmentedControl";
import { useToast } from "../ui/feedback/toastContext";
import { MOD_KEY, hasModifier } from "../../hooks/usePlatform";
import { formatINR } from "../../utils/format";
import {
  importProducts,
  previewProductImport,
  readImportFile,
  saveImportTemplate,
  type ProductImportPreview,
  type ProductImportRow,
  type ProductImportSummary,
} from "../../utils/productStore";

/**
 * Bulk inventory import, as three screens in one dialog: pick a file, read what
 * will happen to every row, commit.
 *
 * The preview is the point. A shop's spreadsheet is the record of its stock,
 * and an importer that swallows it and reports "412 items imported" gives the
 * owner no way to know what it got wrong. So nothing is written until they have
 * seen, line by line and in their own file's numbering, which rows are new,
 * which change something, which already match, and which can't be read at all.
 */

type Stage = "choose" | "preview" | "done";
type RowFilter = "all" | "create" | "update" | "unchanged" | "error";

interface ImportInventoryModalProps {
  /**
   * Always true in practice — the page mounts this only while importing, so
   * every open starts on a clean dialog rather than last time's preview.
   */
  open: boolean;
  onClose: () => void;
  /** Fired after a committed import, so the page can reload its list. */
  onImported: () => void;
}

/** The columns we read, in the order the example file lists them. */
const COLUMN_HELP: { label: string; note: string }[] = [
  { label: "Item Name", note: "required" },
  { label: "Item Code", note: "SKU / barcode" },
  { label: "Type", note: "Product or Service" },
  { label: "Unit", note: "pcs, kg, ltr…" },
  { label: "HSN/SAC", note: "" },
  { label: "Rate", note: "₹ per unit" },
  { label: "Tax Type", note: "e.g. GST" },
  { label: "Tax %", note: "" },
  { label: "Stock Qty", note: "" },
  { label: "Low Stock At", note: "reorder level" },
];

const ACTION_BADGE: Record<
  ProductImportRow["action"],
  { tone: "success" | "accent" | "neutral" | "danger"; label: string }
> = {
  create: { tone: "success", label: "New" },
  update: { tone: "accent", label: "Update" },
  unchanged: { tone: "neutral", label: "No change" },
  error: { tone: "danger", label: "Can't import" },
};

function formatValue(row: ProductImportRow): { rate: string; stock: string } {
  const { rate, stockQty, unit, kind } = row.values;
  return {
    rate: rate === undefined || rate === null ? "—" : formatINR(rate),
    stock:
      kind === "service"
        ? "—"
        : stockQty === undefined || stockQty === null
          ? "—"
          : `${stockQty.toLocaleString("en-IN")} ${unit ?? ""}`.trim(),
  };
}

/** One sentence saying what this row does — the column the owner actually reads. */
function describe(row: ProductImportRow, updateExisting: boolean): string {
  if (row.action === "error") return row.errors.join(" ");
  if (row.action === "unchanged") return "Already matches your inventory.";
  if (row.action === "update") {
    if (!updateExisting) return "Already in inventory — will be left as it is.";
    const renamed =
      row.matchedName && row.matchedName !== row.values.name
        ? ` Currently "${row.matchedName}".`
        : "";
    return `Changes ${row.changes.join(", ").toLowerCase()}.${renamed}`;
  }
  return "Added to your inventory.";
}

function ImportInventoryModal({ open, onClose, onImported }: ImportInventoryModalProps) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("choose");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ProductImportPreview | null>(null);
  const [summary, setSummary] = useState<ProductImportSummary | null>(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [filter, setFilter] = useState<RowFilter>("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setStage("choose");
    setDragging(false);
    setFileName("");
    setCsv("");
    setPreview(null);
    setSummary(null);
    setFilter("all");
    setError("");
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  // Teaching the owner to drag a file at a window that would otherwise navigate
  // to it is a trap: a drop landing anywhere but the well replaces the whole app
  // with the raw CSV, with no way back. Swallowed for as long as we're asking.
  useEffect(() => {
    if (!open) return;
    const swallow = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, [open]);

  const loadFile = useCallback(async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const text = await readImportFile(file);
      const result = await previewProductImport(text);
      setCsv(text);
      setFileName(file.name);
      setPreview(result);
      setFilter(result.counts.error > 0 && result.counts.error === result.counts.total ? "error" : "all");
      setStage("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };

  const downloadExample = async () => {
    try {
      const filePath = await saveImportTemplate();
      if (filePath) toast.success("Example file saved", filePath);
    } catch (err) {
      toast.error(
        "Couldn't save the example file",
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  const importable = preview
    ? preview.counts.create + (updateExisting ? preview.counts.update : 0)
    : 0;

  const runImport = useCallback(async () => {
    if (!preview || importable === 0) return;
    setBusy(true);
    try {
      const result = await importProducts(csv, updateExisting);
      setSummary(result);
      setStage("done");
      onImported();
      toast.success(
        `${(result.created + result.updated).toLocaleString("en-IN")} items imported`,
        fileName
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      toast.error(
        "Nothing was imported",
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setBusy(false);
    }
  }, [csv, fileName, importable, onImported, preview, toast, updateExisting]);

  // ⌘/Ctrl+Enter commits from the preview — the same chord on both platforms,
  // resolved by hasModifier rather than by hard-coding a meta key.
  useEffect(() => {
    if (!open || stage !== "preview") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && hasModifier(e)) {
        e.preventDefault();
        void runImport();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, stage, runImport]);

  const rows =
    preview?.rows.filter((row) => filter === "all" || row.action === filter) ?? [];

  const title =
    stage === "done"
      ? "Import complete"
      : stage === "preview"
        ? "Check before importing"
        : "Import inventory from a file";

  const description =
    stage === "done"
      ? undefined
      : stage === "preview"
        ? `${fileName} · ${preview?.counts.total.toLocaleString("en-IN")} rows read`
        : "Bring in a whole price list or stock count at once, from Excel, Google Sheets or Tally.";

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      size={stage === "choose" ? "lg" : "xl"}
      title={title}
      description={description}
      footer={
        stage === "preview" ? (
          <>
            <div className="mr-auto text-xs text-ink-muted">
              Nothing is saved until you import.
            </div>
            <Button variant="secondary" disabled={busy} onClick={() => reset()}>
              Choose another file
            </Button>
            <Button
              loading={busy}
              disabled={importable === 0}
              trailing={
                importable > 0 ? (
                  <kbd className="kbd ml-1 border-white/25 bg-white/10 text-white/80">
                    {MOD_KEY}↵
                  </kbd>
                ) : undefined
              }
              onClick={runImport}>
              {importable === 0
                ? "Nothing to import"
                : `Import ${importable.toLocaleString("en-IN")} item${importable === 1 ? "" : "s"}`}
            </Button>
          </>
        ) : stage === "done" ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              icon={<FiDownload size={14} />}
              onClick={downloadExample}>
              Download example file
            </Button>
          </>
        )
      }>
      {/* Step 1 — pick a file --------------------------------------------- */}
      {stage === "choose" && (
        <div className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            aria-label="Choose a CSV file to import"
            onClick={() => !busy && fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
              dragging
                ? "border-munsell_blue bg-munsell_blue-5"
                : "border-line-strong bg-surface-subtle hover:border-munsell_blue hover:bg-munsell_blue-5"
            }`}>
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface text-ink-faint shadow-xs">
              <FiUploadCloud size={24} />
            </div>
            <p className="text-sm font-semibold text-ink">
              {busy ? "Reading your file…" : "Drop your CSV here"}
            </p>
            <p className="mt-1.5 text-sm text-ink-muted">
              or <span className="font-semibold text-munsell_blue">browse</span> for it
            </p>
            <p className="mt-3 text-xs text-ink-faint">CSV, up to 4 MB</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void loadFile(file);
              }}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-danger-border bg-danger-soft px-4 py-3">
              <FiAlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
              <p className="text-[13px] leading-relaxed text-danger-ink">{error}</p>
            </div>
          )}

          <div className="rounded-xl border border-line bg-surface-subtle px-4 py-3.5">
            <p className="text-[13px] font-semibold text-ink-soft">
              Columns we understand
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {COLUMN_HELP.map((column) => (
                <span
                  key={column.label}
                  title={column.note || undefined}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink-soft">
                  {column.label}
                  {column.note && (
                    <span className="text-ink-faint">{column.note}</span>
                  )}
                </span>
              ))}
            </div>
            <ul className="mt-3 space-y-1 text-xs leading-relaxed text-ink-muted">
              <li>
                Only <span className="font-semibold text-ink-soft">Item Name</span> is
                required — everything else is optional, and common spellings like
                "Particulars", "Qty" or "GST%" are recognised too.
              </li>
              <li>
                Items already in your inventory are matched by item code, then by
                name, so you can re-import a corrected sheet without creating
                duplicates.
              </li>
              <li>
                Blank cells are left alone. A sheet with just names and quantities
                is a stock count, and won't touch your prices.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Step 2 — read what will happen ----------------------------------- */}
      {stage === "preview" && preview && (
        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-danger-border bg-danger-soft px-4 py-3">
              <FiAlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
              <p className="text-[13px] leading-relaxed text-danger-ink">{error}</p>
            </div>
          )}

          {preview.ignoredColumns.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-info-border bg-info-soft px-4 py-3">
              <FiFileText size={15} className="mt-0.5 shrink-0 text-info" />
              <p className="text-[13px] leading-relaxed text-info-ink">
                Ignored {preview.ignoredColumns.length === 1 ? "column" : "columns"}:{" "}
                <span className="font-semibold">
                  {preview.ignoredColumns.join(", ")}
                </span>
                . Rename one if it was meant to be an item field.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["all", "All", preview.counts.total],
                  ["create", "New", preview.counts.create],
                  ["update", "Updates", preview.counts.update],
                  ["unchanged", "No change", preview.counts.unchanged],
                  ["error", "Problems", preview.counts.error],
                ] as const
              )
                .filter(([key, , count]) => key === "all" || count > 0)
                .map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                      filter === key
                        ? "border-prussian_blue bg-prussian_blue text-white"
                        : key === "error"
                          ? "border-danger-border bg-danger-soft text-danger-ink hover:brightness-[0.97]"
                          : "border-line bg-surface text-ink-soft hover:bg-surface-subtle"
                    }`}>
                    {label}
                    <span className="tnum opacity-70">
                      {count.toLocaleString("en-IN")}
                    </span>
                  </button>
                ))}
            </div>

            {preview.counts.update > 0 && (
              <label className="flex items-center gap-2 text-[13px] text-ink-muted">
                Items already in inventory
                <SegmentedControl
                  size="sm"
                  aria-label="What to do with items already in inventory"
                  value={updateExisting ? "update" : "skip"}
                  onChange={(value) => setUpdateExisting(value === "update")}
                  segments={[
                    { value: "update", label: "Update", title: "Apply the sheet's values" },
                    { value: "skip", label: "Leave alone", title: "Import only new items" },
                  ]}
                />
              </label>
            )}
          </div>

          <div className="max-h-[46vh] overflow-auto rounded-xl border border-line">
            {/* Fixed layout: item names are long and the widths have to be
                shared deliberately, or the name column collapses to make room
                for a sentence that would rather wrap. */}
            <table className="w-full table-fixed border-collapse text-left text-[13px]">
              <thead className="sticky top-0 z-10 bg-surface-subtle">
                <tr className="border-b border-line text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  <th className="w-12 px-3 py-2.5 text-right">Row</th>
                  <th className="w-[28%] px-3 py-2.5">Item</th>
                  <th className="w-20 px-3 py-2.5 text-right">Rate</th>
                  <th className="w-24 px-3 py-2.5 text-right">Stock</th>
                  <th className="w-28 px-3 py-2.5">Action</th>
                  <th className="px-3 py-2.5">What happens</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const badge = ACTION_BADGE[row.action];
                  const skipped = row.action === "update" && !updateExisting;
                  const value = formatValue(row);
                  return (
                    <tr
                      key={row.line}
                      className={`border-b border-line/60 last:border-0 ${
                        row.action === "error" ? "bg-danger-soft/40" : ""
                      }`}>
                      <td className="px-3 py-2 text-right text-ink-faint tnum">
                        {row.line}
                      </td>
                      <td className="overflow-hidden px-3 py-2">
                        <p className="truncate font-medium text-ink">
                          {row.values.name || (
                            <span className="italic text-ink-faint">No name</span>
                          )}
                        </p>
                        {(row.values.sku || row.values.hsnCode) && (
                          <p className="truncate text-xs text-ink-muted tnum">
                            {[
                              row.values.sku,
                              row.values.hsnCode ? `HSN ${row.values.hsnCode}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-ink-soft tnum">
                        {value.rate}
                      </td>
                      <td className="px-3 py-2 text-right text-ink-soft tnum">
                        {value.stock}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          size="sm"
                          tone={skipped ? "neutral" : badge.tone}>
                          {skipped ? "Left alone" : badge.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 leading-relaxed text-ink-muted">
                        {describe(row, updateExisting)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step 3 — what actually happened ---------------------------------- */}
      {stage === "done" && summary && preview && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-success-border bg-success-soft px-4 py-3.5">
            <FiCheckCircle size={18} className="mt-0.5 shrink-0 text-success" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-success-ink">
                {(summary.created + summary.updated).toLocaleString("en-IN")} item
                {summary.created + summary.updated === 1 ? "" : "s"} imported from{" "}
                {fileName}
              </p>
              <p className="mt-1 text-[13px] text-success-ink/80">
                {summary.created.toLocaleString("en-IN")} added ·{" "}
                {summary.updated.toLocaleString("en-IN")} updated ·{" "}
                {summary.skipped.toLocaleString("en-IN")} row
                {summary.skipped === 1 ? "" : "s"} skipped
              </p>
            </div>
          </div>

          {preview.counts.error > 0 && (
            <div className="rounded-xl border border-line">
              <div className="flex items-center gap-2 border-b border-line bg-surface-subtle px-4 py-2.5">
                <FiAlertTriangle size={14} className="text-warning" />
                <p className="text-[13px] font-semibold text-ink-soft">
                  {preview.counts.error} row
                  {preview.counts.error === 1 ? "" : "s"} couldn't be read
                </p>
                <span className="ml-auto text-xs text-ink-faint">
                  Fix these in your file and import it again
                </span>
              </div>
              <ul className="max-h-56 divide-y divide-line/60 overflow-auto">
                {preview.rows
                  .filter((row) => row.action === "error")
                  .map((row) => (
                    <li key={row.line} className="flex gap-3 px-4 py-2 text-[13px]">
                      <span className="w-10 shrink-0 text-right text-ink-faint tnum">
                        {row.line}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-ink">
                          {row.values.name || "—"}
                        </span>
                        <span className="ml-2 text-ink-muted">
                          {row.errors.join(" ")}
                        </span>
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              icon={<FiRefreshCw size={14} />}
              onClick={reset}>
              Import another file
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default ImportInventoryModal;
