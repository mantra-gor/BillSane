// Thin renderer wrapper over the main-process product/inventory service. Types
// are derived from the preload bridge (types.d.ts) so the DTO shapes stay
// defined in exactly one place — the electron domain layer.

export type ProductOption = Awaited<
  ReturnType<Window["electron"]["searchProducts"]>
>[number];
export type ProductSummary = Awaited<
  ReturnType<Window["electron"]["listProducts"]>
>[number];
export type ProductInput = Parameters<Window["electron"]["createProduct"]>[0];
export type ProductUpdateInput = Parameters<
  Window["electron"]["updateProduct"]
>[0];
export type ProductKind = ProductOption["kind"];

// Matches the customer lookup's DEBOUNCE_MS: long enough that a fast typist
// fires one query per word, short enough that the menu is open by the time they
// look up.
const SEARCH_DEBOUNCE_MS = 250;

export function searchProducts(query: string): Promise<ProductOption[]> {
  return window.electron.searchProducts(query);
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
let settleSuperseded: (() => void) | undefined;

/**
 * The keystroke-driven search behind the invoice line dropdown.
 *
 * A superseded call is settled empty rather than dropped: react-select's Async
 * renders only the most recent promise it issued, so a stale answer is ignored
 * either way — but every promise still has to settle, or its spinner never
 * stops.
 */
export function searchProductsDebounced(query: string): Promise<ProductOption[]> {
  clearTimeout(searchTimer);
  settleSuperseded?.();

  return new Promise((resolve) => {
    settleSuperseded = () => resolve([]);
    searchTimer = setTimeout(() => {
      settleSuperseded = undefined;
      searchProducts(query)
        .then(resolve)
        // A catalog lookup is an assist, not a gate — if the database is
        // unreachable the counter still types the name and bills the customer,
        // and the save path reports the real error.
        .catch(() => resolve([]));
    }, SEARCH_DEBOUNCE_MS);
  });
}

export function listProducts(search?: string): Promise<ProductSummary[]> {
  return window.electron.listProducts(search);
}

export async function createProduct(input: ProductInput): Promise<void> {
  const result = await window.electron.createProduct(input);
  if (!result.ok) throw new Error(result.error);
}

export async function updateProduct(input: ProductUpdateInput): Promise<void> {
  const result = await window.electron.updateProduct(input);
  if (!result.ok) throw new Error(result.error);
}

export async function deleteProduct(id: number): Promise<void> {
  const result = await window.electron.deleteProduct(id);
  if (!result.ok) throw new Error(result.error);
}

// --- Bulk import -------------------------------------------------------------

export type ProductImportPreview = Extract<
  Awaited<ReturnType<Window["electron"]["previewProductImport"]>>,
  { ok: true }
>["preview"];
export type ProductImportRow = ProductImportPreview["rows"][number];
export type ProductImportAction = ProductImportRow["action"];
export type ProductImportSummary = Extract<
  Awaited<ReturnType<Window["electron"]["importProducts"]>>,
  { ok: true }
>;

/**
 * A spreadsheet of items is measured in kilobytes. A cap this far above what
 * the feature is for exists only to give a picked-the-wrong-file mistake a
 * sentence instead of a frozen window.
 */
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

/** True for anything we'll try to parse — extension or MIME, since Windows often omits the latter. */
export function isCsvFile(file: File): boolean {
  return /\.csv$/i.test(file.name) || file.type === "text/csv";
}

export async function readImportFile(file: File): Promise<string> {
  if (!isCsvFile(file)) {
    throw new Error(
      `${file.name} isn't a CSV. In Excel or Google Sheets choose File → Save as / Download → CSV, then pick that file.`
    );
  }
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error("That file is larger than 4 MB. Split it and import in parts.");
  }
  return file.text();
}

export async function previewProductImport(csv: string): Promise<ProductImportPreview> {
  const result = await window.electron.previewProductImport(csv);
  if (!result.ok) throw new Error(result.error);
  return result.preview;
}

export async function importProducts(
  csv: string,
  updateExisting: boolean
): Promise<ProductImportSummary> {
  const result = await window.electron.importProducts({ csv, updateExisting });
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** Returns where the example landed, or null if the save dialog was dismissed. */
export async function saveImportTemplate(): Promise<string | null> {
  const result = await window.electron.saveProductImportTemplate();
  if (!result.ok) throw new Error(result.error);
  return result.filePath;
}

export const UNIT_OPTIONS = [
  "pcs",
  "box",
  "kg",
  "g",
  "ltr",
  "ml",
  "mtr",
  "sqft",
  "hr",
  "day",
  "job",
];

export type StockLevel = "uncounted" | "oversold" | "out" | "low" | "ok";

/**
 * How an item's stock reads at a glance.
 *
 * "uncounted" is its own state, not zero: an item auto-created from an invoice
 * line has never been counted, and calling that "out of stock" would be a lie
 * the owner then has to chase.
 */
export function stockLevel(product: {
  kind: ProductKind;
  stockQty: number | null;
  lowStockAt: number | null;
}): StockLevel {
  if (product.kind === "service") return "ok";
  if (product.stockQty === null) return "uncounted";
  if (product.stockQty < 0) return "oversold";
  if (product.stockQty === 0) return "out";
  if (product.lowStockAt !== null && product.stockQty <= product.lowStockAt) {
    return "low";
  }
  return "ok";
}

/** "12 pcs" / "Not counted" — the stock cell and the dropdown's hint line. */
export function formatStock(product: {
  kind: ProductKind;
  stockQty: number | null;
  unit: string;
}): string {
  if (product.kind === "service") return "Service";
  if (product.stockQty === null) return "Not counted";
  return `${product.stockQty.toLocaleString("en-IN")} ${product.unit}`;
}

export function formatLastSold(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
