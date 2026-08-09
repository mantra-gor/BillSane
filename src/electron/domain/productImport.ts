import { DataSource, EntityManager } from "typeorm";
import { Product } from "../db/entities/index.js";
import { isBlankRow, parseCsv, toCsv, type CsvRow } from "./csv.js";
import { displayName, normalizeName } from "./products.js";
import type {
  ProductImportColumn,
  ProductImportField,
  ProductImportInput,
  ProductImportPreview,
  ProductImportRow,
  ProductImportValues,
  ProductKind,
} from "./types.js";

/**
 * Bulk inventory import.
 *
 * Two entry points, one code path: `previewProductImport` reads the file and
 * says what would happen, `importProducts` re-reads the same text inside a
 * transaction and does it. The commit deliberately re-parses rather than
 * trusting the rows the renderer echoes back — the preview is a report, not a
 * payload, so there is no way for what was shown and what is written to drift.
 */

// A spreadsheet, not a database dump. Past this it's an integration problem and
// the honest answer is to say so rather than freeze the window for a minute.
const MAX_ROWS = 5000;

interface ColumnSpec {
  field: ProductImportField;
  label: string;
  /** Accepted header spellings, already folded by `foldHeader`. */
  aliases: string[];
}

/**
 * The column vocabulary.
 *
 * Deliberately generous: the file the owner has in hand was exported by Tally
 * or typed by hand years ago, and asking them to rename headers before the app
 * will read it is the exact friction this feature exists to remove. Only the
 * item name is required.
 */
const COLUMNS: ColumnSpec[] = [
  {
    field: "name",
    label: "Item name",
    aliases: [
      "name",
      "itemname",
      "productname",
      "item",
      "product",
      "description",
      "particulars",
      "goods",
    ],
  },
  {
    field: "sku",
    label: "Item code",
    aliases: ["sku", "code", "itemcode", "productcode", "barcode", "partno", "partnumber"],
  },
  { field: "kind", label: "Type", aliases: ["kind", "type", "itemtype", "producttype"] },
  { field: "unit", label: "Unit", aliases: ["unit", "units", "uom", "unitofmeasure", "measure"] },
  {
    field: "hsnCode",
    label: "HSN / SAC",
    aliases: ["hsn", "hsncode", "hsnsac", "sac", "saccode", "hsnsaccode"],
  },
  {
    field: "rate",
    label: "Rate",
    aliases: ["rate", "price", "unitprice", "sellingprice", "saleprice", "mrp", "rateperunit"],
  },
  { field: "taxType", label: "Tax type", aliases: ["taxtype", "taxname"] },
  {
    field: "taxPer",
    label: "Tax %",
    aliases: [
      "taxpercent",
      "taxpercentage",
      "taxper",
      "taxrate",
      "gst",
      "gstpercent",
      "gstpercentage",
      "gstrate",
    ],
  },
  {
    field: "stockQty",
    label: "Stock",
    aliases: [
      "stock",
      "stockqty",
      "stockquantity",
      "qty",
      "quantity",
      "instock",
      "openingstock",
      "closingstock",
      "available",
      "availablequantity",
      "balance",
    ],
  },
  {
    field: "lowStockAt",
    label: "Low-stock alert",
    aliases: [
      "lowstockat",
      "lowstock",
      "lowstockalert",
      "reorder",
      "reorderlevel",
      "reorderpoint",
      "minstock",
      "minimumstock",
      "minqty",
    ],
  },
];

/**
 * Fold a header cell to something matchable.
 *
 * `%` becomes the word first, so "Tax %" folds to `taxpercent` and lands on the
 * rate column rather than colliding with "Tax Type".
 */
function foldHeader(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/%/g, "percent")
    .replace(/[^a-z0-9]/g, "");
}

const BY_ALIAS = new Map<string, ColumnSpec>();
for (const column of COLUMNS) {
  for (const alias of column.aliases) BY_ALIAS.set(alias, column);
}
const BY_FIELD = new Map<ProductImportField, ColumnSpec>(
  COLUMNS.map((column) => [column.field, column])
);

// Sheets that just say "Tax" mean the rate about as often as the label, and
// guessing wrong turns a good file into a page of errors. Resolved from the
// column's own contents instead — all-numeric is a rate, anything else a label.
const AMBIGUOUS = new Set(["tax", "taxes"]);

const UNIT_ALIASES: Record<string, string> = {
  piece: "pcs",
  pieces: "pcs",
  pc: "pcs",
  pcs: "pcs",
  no: "pcs",
  nos: "pcs",
  number: "pcs",
  unit: "pcs",
  units: "pcs",
  each: "pcs",
  ea: "pcs",
  box: "box",
  boxes: "box",
  bx: "box",
  ctn: "box",
  carton: "box",
  kg: "kg",
  kgs: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogram: "kg",
  kilograms: "kg",
  g: "g",
  gm: "g",
  gms: "g",
  gram: "g",
  grams: "g",
  l: "ltr",
  ltr: "ltr",
  ltrs: "ltr",
  litre: "ltr",
  litres: "ltr",
  liter: "ltr",
  liters: "ltr",
  ml: "ml",
  mtr: "mtr",
  m: "mtr",
  meter: "mtr",
  meters: "mtr",
  metre: "mtr",
  metres: "mtr",
  sqft: "sqft",
  sqfeet: "sqft",
  squarefeet: "sqft",
  hr: "hr",
  hrs: "hr",
  hour: "hr",
  hours: "hr",
  day: "day",
  days: "day",
  job: "job",
  jobs: "job",
  service: "job",
};

const PRODUCT_WORDS = new Set(["product", "products", "goods", "item", "items", "stock", "p", "g"]);
const SERVICE_WORDS = new Set(["service", "services", "labour", "labor", "work", "s"]);

/** The example file the app hands out, and the shape this parser is happiest with. */
export const IMPORT_TEMPLATE_CSV = toCsv([
  [
    "Item Name",
    "Item Code",
    "Type",
    "Unit",
    "HSN/SAC",
    "Rate",
    "Tax Type",
    "Tax %",
    "Stock Qty",
    "Low Stock At",
  ],
  ["A4 Notebook 200 Pages", "NB-A4-200", "Product", "pcs", "4820", "120", "GST", "12", "150", "25"],
  ["Gel Pen Blue", "PEN-GEL-BL", "Product", "pcs", "9608", "15", "GST", "18", "500", "100"],
  ["Sugar (Loose)", "", "Product", "kg", "1701", "48", "GST", "5", "80", "10"],
  ["Basmati Rice 5kg Bag", "RICE-BAS-5", "Product", "box", "1006", "620", "GST", "5", "40", "8"],
  ["Delivery Within City", "", "Service", "job", "9968", "250", "GST", "18", "", ""],
]);

/** Blank cells are absence, not data — the difference "leave alone" rests on. */
function cellText(row: CsvRow, index: number | undefined): string {
  if (index === undefined) return "";
  return (row.cells[index] ?? "").trim();
}

/**
 * Read a number the way it was typed, not the way a parser wishes it were:
 * "₹1,250.00", "1250/-", "18%" and " 1250 " are all the same number to a person.
 */
function parseNumber(raw: string): number | null {
  const cleaned = raw
    .replace(/[₹$€£]/g, "")
    .replace(/,/g, "")
    .replace(/%/g, "")
    .replace(/\/-\s*$/, "")
    .replace(/\s/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function looksNumeric(raw: string): boolean {
  return raw.trim() === "" || parseNumber(raw) !== null;
}

function parseKind(raw: string): ProductKind | null {
  const folded = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (!folded) return null;
  if (SERVICE_WORDS.has(folded)) return "service";
  if (PRODUCT_WORDS.has(folded)) return "product";
  return null;
}

function parseUnit(raw: string): string {
  const folded = raw.toLowerCase().replace(/[^a-z]/g, "");
  return UNIT_ALIASES[folded] ?? raw.trim();
}

/**
 * Match the header row to canonical fields.
 *
 * Later duplicates of a column lose to the first — a sheet with two "Rate"
 * columns is a human mistake, and quietly reading the second one is worse than
 * reading the first and listing the other under "ignored".
 */
function mapHeader(
  header: CsvRow,
  body: CsvRow[]
): { columns: ProductImportColumn[]; index: Map<ProductImportField, number>; ignored: string[] } {
  const columns: ProductImportColumn[] = [];
  const index = new Map<ProductImportField, number>();
  const ignored: string[] = [];

  header.cells.forEach((heading, position) => {
    const text = heading.trim();
    if (!text) return;

    const folded = foldHeader(text);
    let spec = BY_ALIAS.get(folded);

    if (!spec && AMBIGUOUS.has(folded)) {
      const numeric = body.every((row) => looksNumeric(cellText(row, position)));
      spec = BY_FIELD.get(numeric ? "taxPer" : "taxType");
    }

    if (!spec || index.has(spec.field)) {
      ignored.push(text);
      return;
    }

    index.set(spec.field, position);
    columns.push({ field: spec.field, label: spec.label, heading: text });
  });

  return { columns, index, ignored };
}

interface ParsedRow {
  line: number;
  values: ProductImportValues;
  errors: string[];
}

/** Turn one CSV line into typed values, collecting every complaint rather than the first. */
function readRow(row: CsvRow, index: Map<ProductImportField, number>): ParsedRow {
  const errors: string[] = [];
  const values: ProductImportValues = { name: "" };

  const name = displayName(cellText(row, index.get("name")));
  if (!name) errors.push("No item name.");
  values.name = name;

  const readNumber = (
    field: "rate" | "taxPer" | "stockQty" | "lowStockAt",
    check?: (value: number) => string | null
  ) => {
    const raw = cellText(row, index.get(field));
    if (!raw) return;
    const parsed = parseNumber(raw);
    const label = BY_FIELD.get(field)?.label ?? field;
    if (parsed === null) {
      errors.push(`${label} "${raw}" isn't a number.`);
      return;
    }
    const complaint = check?.(parsed);
    if (complaint) {
      errors.push(complaint);
      return;
    }
    values[field] = parsed;
  };

  const sku = cellText(row, index.get("sku"));
  if (sku) values.sku = sku;

  const kindRaw = cellText(row, index.get("kind"));
  if (kindRaw) {
    const kind = parseKind(kindRaw);
    if (kind) values.kind = kind;
    else errors.push(`Type "${kindRaw}" should be Product or Service.`);
  }

  const unit = cellText(row, index.get("unit"));
  if (unit) values.unit = parseUnit(unit);

  const hsn = cellText(row, index.get("hsnCode"));
  if (hsn) values.hsnCode = hsn;

  readNumber("rate", (value) => (value < 0 ? "Rate can't be negative." : null));
  readNumber("taxPer", (value) =>
    value < 0 || value > 100 ? "Tax % has to be between 0 and 100." : null
  );
  // Stock may legitimately be negative: the catalog already records oversold
  // items, and refusing to import one would just hide it.
  readNumber("stockQty");
  readNumber("lowStockAt", (value) =>
    value < 0 ? "Low-stock alert can't be negative." : null
  );

  const taxType = cellText(row, index.get("taxType"));
  if (taxType) values.taxType = taxType;

  return { line: row.line, values, errors };
}

/** Present-and-different, where absent always means "the file didn't say". */
function diffAgainst(product: Product, values: ProductImportValues): string[] {
  const changes: string[] = [];
  const note = (field: ProductImportField) => {
    changes.push(BY_FIELD.get(field)?.label ?? field);
  };

  if (values.name && values.name !== product.name) note("name");
  if (values.sku !== undefined && values.sku !== product.sku) note("sku");
  if (values.kind !== undefined && values.kind !== product.kind) note("kind");
  if (values.unit !== undefined && values.unit !== product.unit) note("unit");
  if (values.hsnCode !== undefined && values.hsnCode !== product.hsnCode) note("hsnCode");
  if (values.rate !== undefined && values.rate !== product.rate) note("rate");
  if (values.taxType !== undefined && values.taxType !== product.taxType) note("taxType");
  if (values.taxPer !== undefined && values.taxPer !== product.taxPer) note("taxPer");

  // A service is billed, never counted, so stock columns are ignored for one
  // rather than reported as a change that would then not happen.
  const kind = values.kind ?? product.kind;
  if (kind !== "service") {
    if (values.stockQty !== undefined && values.stockQty !== product.stockQty) note("stockQty");
    if (values.lowStockAt !== undefined && values.lowStockAt !== product.lowStockAt) {
      note("lowStockAt");
    }
  }

  return changes;
}

/** Write parsed values onto a row, leaving anything the file didn't mention alone. */
function applyValues(product: Product, values: ProductImportValues): void {
  if (values.name) {
    product.name = values.name;
    product.nameKey = normalizeName(values.name);
  }
  if (values.sku !== undefined) product.sku = values.sku || null;
  if (values.kind !== undefined) product.kind = values.kind;
  if (values.unit !== undefined) product.unit = values.unit || "pcs";
  if (values.hsnCode !== undefined) product.hsnCode = values.hsnCode || null;
  if (values.rate !== undefined) product.rate = values.rate;
  if (values.taxType !== undefined) product.taxType = values.taxType || null;
  if (values.taxPer !== undefined) product.taxPer = values.taxPer;
  if (values.stockQty !== undefined) product.stockQty = values.stockQty;
  if (values.lowStockAt !== undefined) product.lowStockAt = values.lowStockAt;

  if (product.kind === "service") {
    product.stockQty = null;
    product.lowStockAt = null;
  }
}

function blankProduct(): Product {
  const product = new Product();
  product.name = "";
  product.nameKey = "";
  product.sku = null;
  product.kind = "product";
  product.unit = "pcs";
  product.hsnCode = null;
  product.rate = null;
  product.taxType = null;
  product.taxPer = null;
  // Imported without a stock column means never counted, not zero — the same
  // state an item auto-created from an invoice line starts in.
  product.stockQty = null;
  product.lowStockAt = null;
  return product;
}

interface Plan {
  preview: ProductImportPreview;
  /** Per importable row, the catalog row it resolved to. Aligned to `preview.rows`. */
  targets: (Product | null)[];
}

/**
 * The whole decision, made once.
 *
 * Reads the file, matches every row against the catalog and works out whether
 * it creates, updates, changes nothing, or can't be imported at all. The
 * preview renders this; the commit applies it.
 */
async function planImport(manager: EntityManager, csv: string): Promise<Plan> {
  const parsed = parseCsv(csv).filter((row) => !isBlankRow(row));
  if (parsed.length === 0) {
    throw new Error("That file is empty.");
  }

  const [header, ...body] = parsed;
  if (body.length === 0) {
    throw new Error("That file has a header row but no items under it.");
  }
  if (body.length > MAX_ROWS) {
    throw new Error(
      `That file has ${body.length.toLocaleString("en-IN")} rows. Import up to ${MAX_ROWS.toLocaleString("en-IN")} at a time.`
    );
  }

  const { columns, index, ignored } = mapHeader(header, body);
  if (!index.has("name")) {
    const seen = header.cells.map((cell) => cell.trim()).filter(Boolean);
    throw new Error(
      seen.length > 0
        ? `Couldn't find an item name column. The first row reads: ${seen.join(", ")}. Rename one of those to "Item Name", or start from the example file.`
        : "The first row of the file has to name the columns — start from the example file."
    );
  }

  const catalog = await manager.getRepository(Product).find();
  const byNameKey = new Map<string, Product>();
  const bySku = new Map<string, Product>();
  for (const product of catalog) {
    byNameKey.set(product.nameKey, product);
    if (product.sku) bySku.set(product.sku.toLowerCase(), product);
  }

  // Two rows for one item is the commonest real defect in a hand-kept sheet,
  // and the one that would otherwise resolve as "update, then update again".
  const nameLines = new Map<string, number>();
  const skuLines = new Map<string, number>();

  const rows: ProductImportRow[] = [];
  const targets: (Product | null)[] = [];

  for (const csvRow of body) {
    const { line, values, errors } = readRow(csvRow, index);
    const nameKey = normalizeName(values.name);
    const skuKey = values.sku ? values.sku.toLowerCase() : null;

    if (nameKey) {
      const seen = nameLines.get(nameKey);
      if (seen !== undefined) errors.push(`Same item as line ${seen}.`);
      else nameLines.set(nameKey, line);
    }
    if (skuKey) {
      const seen = skuLines.get(skuKey);
      if (seen !== undefined) errors.push(`Item code "${values.sku}" is also on line ${seen}.`);
      else skuLines.set(skuKey, line);
    }

    const matchByName = nameKey ? byNameKey.get(nameKey) : undefined;
    const matchBySku = skuKey ? bySku.get(skuKey) : undefined;
    if (matchByName && matchBySku && matchByName.id !== matchBySku.id) {
      errors.push(
        `Item code "${values.sku}" belongs to "${matchBySku.name}" but the name matches "${matchByName.name}".`
      );
    }
    // The code is the stronger identity: a renamed item keeps its code, and
    // matching on it is what lets the sheet correct a spelling.
    const match = matchBySku ?? matchByName ?? null;

    if (errors.length > 0) {
      rows.push({
        line,
        action: "error",
        values,
        matchedId: match?.id ?? null,
        matchedName: match?.name ?? null,
        changes: [],
        errors,
      });
      targets.push(null);
      continue;
    }

    if (match) {
      const changes = diffAgainst(match, values);
      rows.push({
        line,
        action: changes.length > 0 ? "update" : "unchanged",
        values,
        matchedId: match.id,
        matchedName: match.name,
        changes,
        errors: [],
      });
    } else {
      rows.push({
        line,
        action: "create",
        values,
        matchedId: null,
        matchedName: null,
        changes: [],
        errors: [],
      });
    }
    targets.push(match);
  }

  const counts = {
    total: rows.length,
    create: rows.filter((row) => row.action === "create").length,
    update: rows.filter((row) => row.action === "update").length,
    unchanged: rows.filter((row) => row.action === "unchanged").length,
    error: rows.filter((row) => row.action === "error").length,
  };

  return { preview: { columns, ignoredColumns: ignored, rows, counts }, targets };
}

export async function previewProductImport(
  dataSource: DataSource,
  csv: string
): Promise<ProductImportPreview> {
  const { preview } = await planImport(dataSource.manager, csv);
  return preview;
}

/**
 * Apply the plan. One transaction, because a half-loaded catalog is worse than
 * none — the owner can re-run a failed import, but can't tell where it stopped.
 */
export async function importProducts(
  dataSource: DataSource,
  input: ProductImportInput
): Promise<{ created: number; updated: number; skipped: number }> {
  return dataSource.transaction(async (manager) => {
    const { preview, targets } = await planImport(manager, input.csv);
    const repo = manager.getRepository(Product);

    const pending: Product[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    preview.rows.forEach((row, position) => {
      const target = targets[position];

      if (row.action === "error" || row.action === "unchanged") {
        skipped += 1;
        return;
      }
      if (row.action === "update") {
        if (!input.updateExisting || !target) {
          skipped += 1;
          return;
        }
        applyValues(target, row.values);
        pending.push(target);
        updated += 1;
        return;
      }

      const product = blankProduct();
      applyValues(product, row.values);
      pending.push(product);
      created += 1;
    });

    if (pending.length > 0) {
      // Chunked so a large sheet doesn't build one statement with more
      // parameters than SQLite will bind.
      await repo.save(pending, { chunk: 200 });
    }

    return { created, updated, skipped };
  });
}
