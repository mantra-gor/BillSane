import { DataSource, EntityManager, In, SelectQueryBuilder } from "typeorm";
import { Product } from "../db/entities/index.js";
import type {
  ProductInput,
  ProductOption,
  ProductSummary,
  ProductUpdateInput,
} from "./types.js";

// The dropdown exists to save typing, not to be browsed — past a handful of
// candidates the operator is faster finishing the word than reading the list.
const SEARCH_LIMIT = 8;
const LIST_LIMIT = 500;

// pg returns SUM()/COUNT() as strings; better-sqlite3 as numbers.
function num(value: unknown): number {
  const n = value == null ? 0 : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// MAX(createdAt) comes back as a Date from pg and a string from better-sqlite3.
function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Fold a name to its natural key.
 *
 * Item names are typed at a counter, so "Blue Pen", "blue pen" and "Blue  Pen"
 * are one thing and must resolve to one catalog row. Stored folded and matched
 * exactly — the same trade-off `normalizeEmail` makes for customers, and for the
 * same reason: `LOWER(name) = ?` reads identically but throws away the index.
 */
export function normalizeName(name: string): string {
  return displayName(name).toLowerCase();
}

/**
 * The name as it will be shown and printed — casing kept, spacing tidied.
 *
 * Collapsing runs of whitespace matters more than it looks: two people typing
 * "Blue  Pen" and "Blue Pen" already resolve to one row, so without this the
 * catalog would display whichever spelling happened to be typed last, spurious
 * double space and all.
 */
function displayName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Trim to a value or to null — blank strings are absence, not data. */
function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

interface ProductRow {
  id: unknown;
  name: string;
  sku: string | null;
  kind: string;
  unit: string;
  hsnCode: string | null;
  rate: unknown;
  taxType: string | null;
  taxPer: unknown;
  stockQty: unknown;
  lowStockAt: unknown;
  unitsSold: unknown;
  revenue: unknown;
  lastSoldAt: unknown;
}

/**
 * One catalog row plus what it has sold. Left-joined so an item that has never
 * been billed — the whole point of a catalog you can stock ahead of time — still
 * appears.
 */
function productQuery(dataSource: DataSource): SelectQueryBuilder<Product> {
  return dataSource
    .getRepository(Product)
    .createQueryBuilder("product")
    .leftJoin("product.lineItems", "lineItem")
    .leftJoin("lineItem.invoice", "invoice")
    .select("product.id", "id")
    .addSelect("product.name", "name")
    .addSelect("product.sku", "sku")
    .addSelect("product.kind", "kind")
    .addSelect("product.unit", "unit")
    .addSelect("product.hsnCode", "hsnCode")
    .addSelect("product.rate", "rate")
    .addSelect("product.taxType", "taxType")
    .addSelect("product.taxPer", "taxPer")
    .addSelect("product.stockQty", "stockQty")
    .addSelect("product.lowStockAt", "lowStockAt")
    .addSelect("COALESCE(SUM(lineItem.qty), 0)", "unitsSold")
    .addSelect("COALESCE(SUM(lineItem.subTotal), 0)", "revenue")
    .addSelect("MAX(invoice.createdAt)", "lastSoldAt")
    .groupBy("product.id")
    .addGroupBy("product.name")
    .addGroupBy("product.sku")
    .addGroupBy("product.kind")
    .addGroupBy("product.unit")
    .addGroupBy("product.hsnCode")
    .addGroupBy("product.rate")
    .addGroupBy("product.taxType")
    .addGroupBy("product.taxPer")
    .addGroupBy("product.stockQty")
    .addGroupBy("product.lowStockAt");
}

function toOption(row: ProductRow): ProductOption {
  return {
    id: num(row.id),
    name: row.name,
    sku: row.sku,
    kind: row.kind === "service" ? "service" : "product",
    unit: row.unit,
    hsnCode: row.hsnCode,
    rate: nullableNum(row.rate),
    taxType: row.taxType,
    taxPer: nullableNum(row.taxPer),
    stockQty: nullableNum(row.stockQty),
    lowStockAt: nullableNum(row.lowStockAt),
  };
}

function toSummary(row: ProductRow): ProductSummary {
  return {
    ...toOption(row),
    unitsSold: round(num(row.unitsSold)),
    revenue: round(num(row.revenue)),
    lastSoldAt: toIso(row.lastSoldAt),
  };
}

/**
 * What the invoice line's dropdown reads. Ordered by units sold so the things
 * this shop actually moves are the things sitting under the cursor.
 */
export async function searchProducts(
  dataSource: DataSource,
  query: string
): Promise<ProductOption[]> {
  const term = query.trim().toLowerCase();
  const qb = productQuery(dataSource);
  if (term) {
    qb.where("LOWER(product.name) LIKE :term OR LOWER(product.sku) LIKE :term", {
      term: `%${term}%`,
    });
  }

  const rows = await qb
    .orderBy("COALESCE(SUM(lineItem.qty), 0)", "DESC")
    .addOrderBy("product.name", "ASC")
    .limit(SEARCH_LIMIT)
    .getRawMany<ProductRow>();
  return rows.map(toOption);
}

/** The Inventory table. Search runs in SQL so it stays correct past the cap. */
export async function listProducts(
  dataSource: DataSource,
  search?: string
): Promise<ProductSummary[]> {
  const qb = productQuery(dataSource);

  const term = search?.trim().toLowerCase();
  if (term) {
    qb.where(
      "LOWER(product.name) LIKE :term OR LOWER(product.sku) LIKE :term OR LOWER(product.hsnCode) LIKE :term",
      { term: `%${term}%` }
    );
  }

  const rows = await qb
    .orderBy("product.name", "ASC")
    .limit(LIST_LIMIT)
    .getRawMany<ProductRow>();
  return rows.map(toSummary);
}

/** Shared by create and update — a name or code may only belong to one item. */
async function assertNoClash(
  manager: EntityManager,
  nameKey: string,
  sku: string | null,
  ignoreId?: number
): Promise<void> {
  const repo = manager.getRepository(Product);

  const byName = await repo.findOne({ where: { nameKey } });
  if (byName && byName.id !== ignoreId) {
    throw new Error(`"${byName.name}" is already in your inventory.`);
  }

  if (sku) {
    const bySku = await repo.findOne({ where: { sku } });
    if (bySku && bySku.id !== ignoreId) {
      throw new Error(`Code ${sku} is already used by "${bySku.name}".`);
    }
  }
}

function assignInput(product: Product, input: ProductInput): void {
  const name = displayName(input.name);
  product.name = name;
  product.nameKey = normalizeName(name);
  product.sku = blankToNull(input.sku);
  product.kind = input.kind;
  product.unit = blankToNull(input.unit) ?? "pcs";
  product.hsnCode = blankToNull(input.hsnCode);
  product.rate = input.rate;
  product.taxType = blankToNull(input.taxType);
  product.taxPer = input.taxPer;
  // A service is billed, never counted, so its stock fields are meaningless.
  product.stockQty = input.kind === "service" ? null : input.stockQty;
  product.lowStockAt = input.kind === "service" ? null : input.lowStockAt;
}

export async function createProduct(
  dataSource: DataSource,
  input: ProductInput
): Promise<void> {
  const name = displayName(input.name);
  if (!name) throw new Error("An item needs a name.");

  await dataSource.transaction(async (manager) => {
    await assertNoClash(manager, normalizeName(name), blankToNull(input.sku));
    const product = new Product();
    assignInput(product, input);
    await manager.getRepository(Product).save(product);
  });
}

export async function updateProduct(
  dataSource: DataSource,
  input: ProductUpdateInput
): Promise<void> {
  const name = displayName(input.name);
  if (!name) throw new Error("An item needs a name.");

  await dataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Product);
    const product = await repo.findOne({ where: { id: input.id } });
    if (!product) throw new Error("That item no longer exists.");

    await assertNoClash(manager, normalizeName(name), blankToNull(input.sku), input.id);
    assignInput(product, input);
    await repo.save(product);
  });
}

/**
 * Resolve every line on an invoice to a catalog row, creating what doesn't
 * exist yet.
 *
 * The mirror of `resolveCustomer`: an explicit id means the operator picked from
 * the dropdown and that record wins; otherwise the folded name is the identity;
 * otherwise this is something new and the catalog learns it. A line typed
 * straight into the grid is the ordinary path, not an error — the item lands in
 * inventory uncounted and the owner gives it a quantity later.
 *
 * Returns one entry per input line, aligned by index, null for blank lines.
 */
export async function resolveLineProducts(
  manager: EntityManager,
  lines: LineItem[]
): Promise<(Product | null)[]> {
  const repo = manager.getRepository(Product);

  const requestedIds = [
    ...new Set(
      lines
        .map((line) => line.productId)
        .filter((id): id is number => typeof id === "number")
    ),
  ];
  const byId = new Map<number, Product>();
  if (requestedIds.length > 0) {
    const found = await repo.find({ where: { id: In(requestedIds) } });
    for (const product of found) byId.set(product.id, product);
  }

  // Keys still unaccounted for after the id pass — either the line was typed,
  // or its id has since been deleted and the name is the better answer.
  const keys = new Set<string>();
  for (const line of lines) {
    if (line.productId != null && byId.has(line.productId)) continue;
    const key = normalizeName(line.itemName ?? "");
    if (key) keys.add(key);
  }

  const byKey = new Map<string, Product>();
  if (keys.size > 0) {
    const found = await repo.find({ where: { nameKey: In([...keys]) } });
    for (const product of found) byKey.set(product.nameKey, product);
  }

  const resolved: (Product | null)[] = [];
  for (const line of lines) {
    const linked = line.productId != null ? byId.get(line.productId) : undefined;
    if (linked) {
      resolved.push(linked);
      continue;
    }

    const name = displayName(line.itemName ?? "");
    const key = normalizeName(name);
    if (!key) {
      resolved.push(null);
      continue;
    }

    const existing = byKey.get(key);
    if (existing) {
      resolved.push(existing);
      continue;
    }

    const created = await repo.save(
      repo.create({
        name,
        nameKey: key,
        sku: null,
        kind: "product",
        unit: "pcs",
        hsnCode: null,
        rate: line.rate ?? null,
        taxType: blankToNull(line.taxType),
        taxPer: line.taxPer ?? null,
        // Never counted. Stock rules skip it until the owner says how many
        // there are, so a first sale can't invent a negative balance.
        stockQty: null,
        lowStockAt: null,
      })
    );
    // Two lines of the same new item on one invoice must not create it twice.
    byKey.set(key, created);
    resolved.push(created);
  }

  return resolved;
}

/**
 * Move stock by a signed amount per product — negative when an invoice is
 * created, positive when one is deleted.
 *
 * Skips services (never counted) and items whose quantity is still null (never
 * counted *yet*). Deliberately does not refuse to go negative: a counter that
 * can't ring up a sale because the book-keeping is behind is worse than a
 * balance the Inventory page flags as oversold.
 */
export async function applyStockDelta(
  manager: EntityManager,
  deltas: Map<number, number>
): Promise<void> {
  const ids = [...deltas.keys()];
  if (ids.length === 0) return;

  const repo = manager.getRepository(Product);
  const products = await repo.find({ where: { id: In(ids) } });

  const touched = products.filter(
    (product) => product.kind !== "service" && product.stockQty !== null
  );
  if (touched.length === 0) return;

  for (const product of touched) {
    product.stockQty = round((product.stockQty ?? 0) + (deltas.get(product.id) ?? 0));
  }
  await repo.save(touched);
}

/** Sum the quantities an invoice's lines take out of (or put back into) stock. */
export function stockDeltas(
  lines: LineItem[],
  products: (Product | null)[],
  sign: 1 | -1
): Map<number, number> {
  const deltas = new Map<number, number>();
  lines.forEach((line, index) => {
    const product = products[index];
    const qty = line.qty ?? 0;
    if (!product || !Number.isFinite(qty) || qty === 0) return;
    deltas.set(product.id, (deltas.get(product.id) ?? 0) + sign * qty);
  });
  return deltas;
}
