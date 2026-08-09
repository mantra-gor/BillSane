import { DataSource } from "typeorm";
import { Invoice, InvoiceLineItem, Product } from "../db/entities/index.js";
import type {
  CustomerMix,
  CustomerShare,
  DashboardInsights,
  DashboardKpis,
  InsightAlert,
  InsightsBucket,
  InsightsRangeInput,
  InventorySnapshot,
  KpiValue,
  LapsedCustomer,
  PaymentSlice,
  RecentInvoice,
  ReorderItem,
  ReorderReason,
  TopItem,
  TrendPoint,
} from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_LIMIT = 5;
const PANEL_LIMIT = 6;

// A customer with a buying habit who hasn't been seen in two months has, for a
// neighbourhood shop, effectively lapsed — long enough not to flag someone who
// simply shops monthly, short enough to still be worth a phone call.
const LAPSED_DAYS = 60;

// Under two weeks of stock left is "order it now" at the pace this shop sells.
const COVER_WARNING_DAYS = 14;

// Alerts are a glance, not an inbox. Past four the strip stops being read.
const ALERT_LIMIT = 4;

// pg returns SUM()/COUNT() as strings; better-sqlite3 as numbers. Coerce
// everything to a finite number so the renderer's money formatting never breaks.
function num(value: unknown): number {
  const n = value == null ? 0 : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function deltaPct(current: number, previous: number | null): number | null {
  if (previous == null || previous === 0) return null;
  return round(((current - previous) / previous) * 100, 1);
}

// --- Range resolution -------------------------------------------------------

interface ResolvedRange {
  from: Date | null; // null => no lower bound ("all")
  to: Date;
  prevFrom: Date | null; // null => no comparable prior window (no deltas)
  prevTo: Date | null;
  bucket: InsightsBucket;
}

const TOKEN_DAYS: Record<Exclude<InsightsRangeInput["token"], "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

function bucketForSpan(days: number): InsightsBucket {
  if (days <= 31) return "day";
  if (days <= 92) return "week";
  return "month";
}

function resolveRange(input: InsightsRangeInput): ResolvedRange {
  const to = input.to ? new Date(input.to) : new Date();

  // Explicit custom window takes precedence over the token span.
  if (input.from) {
    const from = new Date(input.from);
    const spanMs = Math.max(to.getTime() - from.getTime(), DAY_MS);
    return {
      from,
      to,
      prevFrom: new Date(from.getTime() - spanMs),
      prevTo: from,
      bucket: bucketForSpan(spanMs / DAY_MS),
    };
  }

  if (input.token === "all") {
    return { from: null, to, prevFrom: null, prevTo: null, bucket: "month" };
  }

  const days = TOKEN_DAYS[input.token];
  const from = new Date(to.getTime() - days * DAY_MS);
  return {
    from,
    to,
    prevFrom: new Date(from.getTime() - days * DAY_MS),
    prevTo: from,
    bucket: bucketForSpan(days),
  };
}

// --- Aggregate queries ------------------------------------------------------

interface Totals {
  revenue: number;
  count: number;
  tax: number;
}

async function queryTotals(
  dataSource: DataSource,
  from: Date | null,
  to: Date
): Promise<Totals> {
  const qb = dataSource
    .getRepository(Invoice)
    .createQueryBuilder("invoice")
    .select("COALESCE(SUM(invoice.totalAmount), 0)", "revenue")
    .addSelect("COALESCE(SUM(invoice.totalTax), 0)", "tax")
    .addSelect("COUNT(*)", "count")
    .where("invoice.createdAt <= :to", { to });
  if (from) qb.andWhere("invoice.createdAt >= :from", { from });

  const raw = await qb.getRawOne<{ revenue: unknown; tax: unknown; count: unknown }>();
  return {
    revenue: num(raw?.revenue),
    tax: num(raw?.tax),
    count: num(raw?.count),
  };
}

function toKpis(
  current: Totals,
  previous: Totals | null,
  customers: CustomerTotals,
  prevCustomers: CustomerTotals | null
): DashboardKpis {
  const avg = (t: Totals): number => (t.count === 0 ? 0 : t.revenue / t.count);
  const kpi = (value: number, prev: number | null): KpiValue => ({
    value: round(value),
    deltaPct: deltaPct(value, prev),
  });
  return {
    revenue: kpi(current.revenue, previous?.revenue ?? null),
    invoiceCount: kpi(current.count, previous?.count ?? null),
    taxCollected: kpi(current.tax, previous?.tax ?? null),
    avgInvoice: kpi(avg(current), previous ? avg(previous) : null),
    activeCustomers: kpi(customers.active, prevCustomers?.active ?? null),
    newCustomers: kpi(customers.acquired, prevCustomers?.acquired ?? null),
    repeatRatePct: kpi(customers.repeatRatePct, prevCustomers?.repeatRatePct ?? null),
    avgCustomerValue: kpi(
      customers.avgCustomerValue,
      prevCustomers?.avgCustomerValue ?? null
    ),
  };
}

async function queryPaymentMix(
  dataSource: DataSource,
  from: Date | null,
  to: Date
): Promise<PaymentSlice[]> {
  const qb = dataSource
    .getRepository(Invoice)
    .createQueryBuilder("invoice")
    .select("invoice.paymentType", "type")
    .addSelect("COALESCE(SUM(invoice.totalAmount), 0)", "amount")
    .addSelect("COUNT(*)", "count")
    .where("invoice.createdAt <= :to", { to })
    .groupBy("invoice.paymentType")
    .orderBy("COALESCE(SUM(invoice.totalAmount), 0)", "DESC");
  if (from) qb.andWhere("invoice.createdAt >= :from", { from });

  const rows = await qb.getRawMany<{ type: string; amount: unknown; count: unknown }>();
  return rows.map((r) => ({
    type: r.type ?? "unknown",
    amount: round(num(r.amount)),
    count: num(r.count),
  }));
}

async function queryTopItems(
  dataSource: DataSource,
  from: Date | null,
  to: Date
): Promise<TopItem[]> {
  const qb = dataSource
    .getRepository(InvoiceLineItem)
    .createQueryBuilder("li")
    .innerJoin("li.invoice", "invoice")
    .select("li.itemName", "itemName")
    .addSelect("COALESCE(SUM(li.subTotal), 0)", "revenue")
    .addSelect("COALESCE(SUM(li.qty), 0)", "qty")
    .where("invoice.createdAt <= :to", { to })
    .andWhere("li.itemName IS NOT NULL")
    .groupBy("li.itemName")
    .orderBy("COALESCE(SUM(li.subTotal), 0)", "DESC")
    .limit(TOP_LIMIT);
  if (from) qb.andWhere("invoice.createdAt >= :from", { from });

  const rows = await qb.getRawMany<{ itemName: string; revenue: unknown; qty: unknown }>();
  return rows.map((r) => ({
    itemName: r.itemName,
    revenue: round(num(r.revenue)),
    qty: round(num(r.qty)),
  }));
}

async function queryTopCustomers(
  dataSource: DataSource,
  from: Date | null,
  to: Date,
  totalRevenue: number
): Promise<CustomerShare[]> {
  const qb = dataSource
    .getRepository(Invoice)
    .createQueryBuilder("invoice")
    .innerJoin("invoice.customer", "customer")
    .select("customer.name", "name")
    .addSelect("customer.phone", "phone")
    .addSelect("COALESCE(SUM(invoice.totalAmount), 0)", "revenue")
    .addSelect("COUNT(*)", "invoiceCount")
    .where("invoice.createdAt <= :to", { to })
    .groupBy("customer.id")
    .addGroupBy("customer.name")
    .addGroupBy("customer.phone")
    .orderBy("COALESCE(SUM(invoice.totalAmount), 0)", "DESC")
    .limit(TOP_LIMIT);
  if (from) qb.andWhere("invoice.createdAt >= :from", { from });

  const rows = await qb.getRawMany<{
    name: string;
    phone: string;
    revenue: unknown;
    invoiceCount: unknown;
  }>();
  return rows.map((r) => {
    const revenue = round(num(r.revenue));
    return {
      name: r.name,
      phone: r.phone,
      revenue,
      invoiceCount: num(r.invoiceCount),
      sharePct: totalRevenue > 0 ? round((revenue / totalRevenue) * 100, 1) : 0,
    };
  });
}

async function queryRecentInvoices(
  dataSource: DataSource,
  from: Date | null,
  to: Date
): Promise<RecentInvoice[]> {
  const qb = dataSource
    .getRepository(Invoice)
    .createQueryBuilder("invoice")
    .innerJoin("invoice.customer", "customer")
    .select("invoice.id", "id")
    .addSelect("invoice.invoiceNo", "invoiceNo")
    .addSelect("invoice.date", "date")
    .addSelect("invoice.totalAmount", "totalAmount")
    .addSelect("invoice.paymentType", "paymentType")
    .addSelect("customer.name", "customerName")
    .where("invoice.createdAt <= :to", { to })
    .orderBy("invoice.createdAt", "DESC")
    .limit(8);
  if (from) qb.andWhere("invoice.createdAt >= :from", { from });

  const rows = await qb.getRawMany<{
    id: string;
    invoiceNo: string;
    date: string;
    totalAmount: unknown;
    paymentType: string;
    customerName: string;
  }>();
  return rows.map((r) => ({
    id: r.id,
    invoiceNo: r.invoiceNo,
    date: r.date,
    customerName: r.customerName,
    totalAmount: round(num(r.totalAmount)),
    paymentType: r.paymentType,
  }));
}

// --- Invoice facts (one narrow scan, reused by trend + customer analytics) --

/** One invoice, reduced to what the JS-side aggregations actually need. */
interface InvoiceFact {
  id: string;
  customerId: number;
  at: Date;
  amount: number;
  /** True when this is the customer's first ever invoice. */
  first: boolean;
}

/**
 * Every invoice up to `to`, oldest first.
 *
 * Deliberately unbounded at the start even when the range is "last 7 days":
 * "is this customer new?" and "have they been here before?" are facts about
 * their whole history, and a window-scoped query cannot answer them. The
 * projection is four columns and this is a local SQLite file, so one full scan
 * is cheaper than the extra round trips the alternative needs.
 */
async function queryInvoiceFacts(
  dataSource: DataSource,
  to: Date
): Promise<InvoiceFact[]> {
  const rows = await dataSource
    .getRepository(Invoice)
    .createQueryBuilder("invoice")
    .innerJoin("invoice.customer", "customer")
    .select("invoice.id", "id")
    .addSelect("customer.id", "customerId")
    .addSelect("invoice.createdAt", "createdAt")
    .addSelect("invoice.totalAmount", "amount")
    .where("invoice.createdAt <= :to", { to })
    .orderBy("invoice.createdAt", "ASC")
    .getRawMany<{
      id: string;
      customerId: unknown;
      createdAt: unknown;
      amount: unknown;
    }>();

  // Oldest first, so the first row seen for a customer is their first purchase.
  // Marking it here avoids comparing timestamps for equality later, which the
  // sqlite/pg date representations make unreliable.
  const seen = new Set<number>();
  return rows.map((row) => {
    const customerId = num(row.customerId);
    const first = !seen.has(customerId);
    seen.add(customerId);
    return {
      id: row.id,
      customerId,
      at: new Date(row.createdAt as string | number | Date),
      amount: num(row.amount),
      first,
    };
  });
}

function inWindow(fact: InvoiceFact, from: Date | null, to: Date): boolean {
  const t = fact.at.getTime();
  return t <= to.getTime() && (from === null || t >= from.getTime());
}

// --- Customer analytics -----------------------------------------------------

interface CustomerTotals {
  active: number;
  acquired: number;
  repeatRatePct: number;
  avgCustomerValue: number;
  mix: CustomerMix;
}

/**
 * New/returning is judged per *invoice*, not per customer.
 *
 * Per-customer would make every customer "new" on the All-time range, since
 * nobody existed before the beginning of the data. Per-invoice partitions the
 * window cleanly on every range: an invoice is either somebody's first or it
 * isn't, and the two sides always add back up to the window's totals.
 */
function customerTotals(facts: InvoiceFact[]): CustomerTotals {
  const mix: CustomerMix = {
    firstTime: { invoices: 0, revenue: 0 },
    returning: { invoices: 0, revenue: 0 },
  };
  const customers = new Set<number>();
  const acquired = new Set<number>();

  for (const fact of facts) {
    customers.add(fact.customerId);
    const side = fact.first ? mix.firstTime : mix.returning;
    side.invoices += 1;
    side.revenue += fact.amount;
    if (fact.first) acquired.add(fact.customerId);
  }

  mix.firstTime.revenue = round(mix.firstTime.revenue);
  mix.returning.revenue = round(mix.returning.revenue);

  const revenue = mix.firstTime.revenue + mix.returning.revenue;
  return {
    active: customers.size,
    acquired: acquired.size,
    repeatRatePct:
      facts.length === 0 ? 0 : round((mix.returning.invoices / facts.length) * 100, 1),
    avgCustomerValue: customers.size === 0 ? 0 : round(revenue / customers.size),
    mix,
  };
}

/**
 * Regulars who have stopped coming — the most directly actionable list on the
 * page, because each row is a phone call. Deliberately not range-filtered:
 * "hasn't been back" is measured against today, whatever window is on screen.
 */
async function queryLapsedCustomers(
  dataSource: DataSource,
  to: Date
): Promise<LapsedCustomer[]> {
  const cutoff = new Date(to.getTime() - LAPSED_DAYS * DAY_MS);

  const rows = await dataSource
    .getRepository(Invoice)
    .createQueryBuilder("invoice")
    .innerJoin("invoice.customer", "customer")
    .select("customer.id", "id")
    .addSelect("customer.name", "name")
    .addSelect("customer.phone", "phone")
    .addSelect("COUNT(*)", "invoiceCount")
    .addSelect("COALESCE(SUM(invoice.totalAmount), 0)", "totalSpent")
    .addSelect("MAX(invoice.createdAt)", "lastAt")
    .where("invoice.createdAt <= :to", { to })
    .groupBy("customer.id")
    .addGroupBy("customer.name")
    .addGroupBy("customer.phone")
    // One visit is a passer-by; two or more is a habit worth missing.
    .having("COUNT(*) >= 2")
    .andHaving("MAX(invoice.createdAt) < :cutoff", { cutoff })
    .orderBy("COALESCE(SUM(invoice.totalAmount), 0)", "DESC")
    .limit(PANEL_LIMIT)
    .getRawMany<{
      id: unknown;
      name: string;
      phone: string;
      invoiceCount: unknown;
      totalSpent: unknown;
      lastAt: unknown;
    }>();

  return rows.map((row) => {
    const last = new Date(row.lastAt as string | number | Date);
    return {
      id: num(row.id),
      name: row.name,
      phone: row.phone,
      invoiceCount: num(row.invoiceCount),
      totalSpent: round(num(row.totalSpent)),
      lastInvoiceAt: last.toISOString(),
      daysSince: Math.max(0, Math.floor((to.getTime() - last.getTime()) / DAY_MS)),
    };
  });
}

// --- Inventory --------------------------------------------------------------

/** Units sold per catalog item inside the window, keyed by product id. */
async function queryUnitsSold(
  dataSource: DataSource,
  from: Date | null,
  to: Date
): Promise<Map<number, number>> {
  const qb = dataSource
    .getRepository(InvoiceLineItem)
    .createQueryBuilder("li")
    .innerJoin("li.invoice", "invoice")
    .select("li.productId", "productId")
    .addSelect("COALESCE(SUM(li.qty), 0)", "qty")
    .where("invoice.createdAt <= :to", { to })
    .andWhere("li.productId IS NOT NULL")
    .groupBy("li.productId");
  if (from) qb.andWhere("invoice.createdAt >= :from", { from });

  const rows = await qb.getRawMany<{ productId: unknown; qty: unknown }>();
  return new Map(rows.map((row) => [num(row.productId), num(row.qty)]));
}

function reorderReason(
  stockQty: number,
  lowStockAt: number | null,
  daysCover: number | null
): ReorderReason | null {
  if (stockQty < 0) return "oversold";
  if (stockQty === 0) return "out";
  if (lowStockAt !== null && stockQty <= lowStockAt) return "low";
  if (daysCover !== null && daysCover <= COVER_WARNING_DAYS) return "soon";
  return null;
}

const REORDER_RANK: Record<ReorderReason, number> = {
  oversold: 0,
  out: 1,
  low: 2,
  soon: 3,
};

interface InventoryResult {
  snapshot: InventorySnapshot;
  reorderList: ReorderItem[];
}

/**
 * The shelf, as it stands right now, crossed with how fast it is emptying.
 *
 * Stock levels are point-in-time (there is no stock ledger to replay), so this
 * ignores the date range except for the sales rate that turns a quantity into
 * "days of cover" — which is the number that actually tells an owner when to
 * reorder. Services carry no stock and are excluded throughout.
 */
async function queryInventory(
  dataSource: DataSource,
  from: Date | null,
  to: Date,
  windowDays: number
): Promise<InventoryResult> {
  const [products, unitsSold] = await Promise.all([
    // find(), not getRawMany(): the decimal transformer is what turns pg's
    // string money columns back into numbers.
    dataSource.getRepository(Product).find(),
    queryUnitsSold(dataSource, from, to),
  ]);

  const snapshot: InventorySnapshot = {
    totalItems: products.length,
    uncountedItems: 0,
    stockValue: 0,
    needsRestocking: 0,
    outOfStock: 0,
    deadStockItems: 0,
    deadStockValue: 0,
  };

  const candidates: ReorderItem[] = [];
  const days = Math.max(windowDays, 1);

  for (const product of products) {
    if (product.kind === "service") continue;

    if (product.stockQty === null) {
      snapshot.uncountedItems += 1;
      continue;
    }

    const sold = unitsSold.get(product.id) ?? 0;
    const value = product.stockQty * (product.rate ?? 0);
    if (value > 0) snapshot.stockValue += value;

    if (product.stockQty > 0 && sold === 0) {
      snapshot.deadStockItems += 1;
      snapshot.deadStockValue += Math.max(value, 0);
    }

    const daysCover = sold > 0 ? round(product.stockQty / (sold / days), 1) : null;
    const reason = reorderReason(product.stockQty, product.lowStockAt, daysCover);
    if (!reason) continue;

    if (reason !== "soon") snapshot.needsRestocking += 1;
    if (reason === "out" || reason === "oversold") snapshot.outOfStock += 1;

    candidates.push({
      id: product.id,
      name: product.name,
      sku: product.sku,
      unit: product.unit,
      stockQty: product.stockQty,
      lowStockAt: product.lowStockAt,
      unitsSold: round(sold),
      daysCover,
      reason,
    });
  }

  snapshot.stockValue = round(snapshot.stockValue);
  snapshot.deadStockValue = round(snapshot.deadStockValue);

  candidates.sort((a, b) => {
    const rank = REORDER_RANK[a.reason] - REORDER_RANK[b.reason];
    if (rank !== 0) return rank;
    // Within a tier, whatever runs out soonest goes first; an item with no
    // sales has no cover to run out, so it sinks.
    if (a.daysCover === null) return b.daysCover === null ? 0 : 1;
    if (b.daysCover === null) return -1;
    return a.daysCover - b.daysCover;
  });

  return { snapshot, reorderList: candidates.slice(0, PANEL_LIMIT) };
}

// --- Trend (bucketed in JS from a narrow projection) ------------------------

// ISO Monday-start of the week containing `date`, in UTC.
function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day);
  return d;
}

function bucketStart(date: Date, bucket: InsightsBucket): Date {
  if (bucket === "day") {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
  if (bucket === "week") return startOfWeek(date);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function advance(date: Date, bucket: InsightsBucket): Date {
  const d = new Date(date);
  if (bucket === "day") d.setUTCDate(d.getUTCDate() + 1);
  else if (bucket === "week") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

function bucketLabel(date: Date, bucket: InsightsBucket): string {
  return bucket === "month"
    ? date.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" })
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function buildTrend(facts: InvoiceFact[], range: ResolvedRange): TrendPoint[] {
  // Axis spans the resolved window; for "all" (no lower bound) it starts at the
  // earliest invoice so the chart isn't padded with empty buckets.
  const axisStart = range.from ?? (facts.length ? facts[0].at : range.to);

  const points = new Map<string, TrendPoint>();
  for (
    let cursor = bucketStart(axisStart, range.bucket);
    cursor.getTime() <= range.to.getTime();
    cursor = advance(cursor, range.bucket)
  ) {
    const key = cursor.toISOString();
    points.set(key, { bucket: key, label: bucketLabel(cursor, range.bucket), revenue: 0, count: 0 });
  }

  for (const fact of facts) {
    const point = points.get(bucketStart(fact.at, range.bucket).toISOString());
    if (!point) continue; // outside the generated axis (shouldn't happen)
    point.revenue = round(point.revenue + fact.amount);
    point.count += 1;
  }

  return [...points.values()];
}

// --- Alerts -----------------------------------------------------------------

function money(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function buildAlerts(
  kpis: DashboardKpis,
  topCustomers: CustomerShare[],
  inventory: InventorySnapshot,
  reorderList: ReorderItem[],
  lapsed: LapsedCustomer[]
): InsightAlert[] {
  const alerts: InsightAlert[] = [];

  // Stock is about today, not the window, so it is worth saying even on a
  // period with no sales at all.
  if (inventory.needsRestocking > 0) {
    const worst = reorderList[0];
    alerts.push({
      id: "low-stock",
      level: "warning",
      title: `${plural(inventory.needsRestocking, "item")} need restocking`,
      detail: worst
        ? `${worst.name} is ${worst.reason === "oversold" ? "oversold" : worst.reason === "out" ? "out of stock" : "running low"}${
            inventory.outOfStock > 0
              ? ` — ${plural(inventory.outOfStock, "item")} already at zero or below.`
              : "."
          }`
        : "Check the reorder list below.",
    });
  }

  if (kpis.invoiceCount.value === 0) {
    alerts.push({
      id: "no-sales",
      level: "info",
      title: "No sales in this period",
      detail: "Create an invoice to start tracking revenue here.",
    });
    return alerts.slice(0, ALERT_LIMIT);
  }

  if (kpis.revenue.deltaPct != null && kpis.revenue.deltaPct <= -15) {
    alerts.push({
      id: "sales-dip",
      level: "warning",
      title: `Revenue down ${Math.abs(kpis.revenue.deltaPct)}%`,
      detail: "Sales fell versus the previous period. Worth a closer look.",
    });
  }

  const top = topCustomers[0];
  if (top && top.sharePct >= 40) {
    alerts.push({
      id: "customer-concentration",
      level: "warning",
      title: "High customer concentration",
      detail: `${top.name} accounts for ${top.sharePct}% of revenue this period.`,
    });
  }

  if (lapsed.length > 0) {
    alerts.push({
      id: "lapsed-customers",
      level: "info",
      title: `${plural(lapsed.length, "regular")} ${lapsed.length === 1 ? "has" : "have"} gone quiet`,
      detail: `${lapsed[0].name} last bought ${lapsed[0].daysSince} days ago and has spent ${money(lapsed[0].totalSpent)} with you.`,
    });
  }

  if (inventory.deadStockValue > 0) {
    alerts.push({
      id: "dead-stock",
      level: "info",
      title: `${money(inventory.deadStockValue)} of stock isn't moving`,
      detail: `${plural(inventory.deadStockItems, "item")} sat on the shelf all period without a single sale.`,
    });
  }

  if (kpis.taxCollected.value > 0) {
    alerts.push({
      id: "tax-due",
      level: "info",
      title: "GST set-aside",
      detail: `${money(kpis.taxCollected.value)} in tax collected this period — reserve it for filing.`,
    });
  }

  // Warnings first: the strip is capped, and a stock-out matters more than a
  // filing reminder that will still be true tomorrow.
  return alerts
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "warning" ? -1 : 1))
    .slice(0, ALERT_LIMIT);
}

// --- Public entry point -----------------------------------------------------

export async function getDashboardInsights(
  dataSource: DataSource,
  input: InsightsRangeInput
): Promise<DashboardInsights> {
  const range = resolveRange(input);

  const current = await queryTotals(dataSource, range.from, range.to);
  const previous =
    range.prevFrom && range.prevTo
      ? await queryTotals(dataSource, range.prevFrom, range.prevTo)
      : null;

  const facts = await queryInvoiceFacts(dataSource, range.to);
  const windowFacts = facts.filter((fact) => inWindow(fact, range.from, range.to));
  const customers = customerTotals(windowFacts);
  const prevCustomers =
    range.prevFrom && range.prevTo
      ? customerTotals(
          facts.filter((fact) => inWindow(fact, range.prevFrom, range.prevTo!))
        )
      : null;

  const kpis = toKpis(current, previous, customers, prevCustomers);
  const trend = buildTrend(windowFacts, range);

  // For "all", the effective start is the earliest bucket the trend produced.
  const effectiveFrom =
    range.from ?? (trend.length ? new Date(trend[0].bucket) : range.to);
  const windowDays = Math.max(
    (range.to.getTime() - effectiveFrom.getTime()) / DAY_MS,
    1
  );

  const [paymentMix, topItems, topCustomers, recentInvoices, lapsedCustomers, inventory] =
    await Promise.all([
      queryPaymentMix(dataSource, range.from, range.to),
      queryTopItems(dataSource, range.from, range.to),
      queryTopCustomers(dataSource, range.from, range.to, current.revenue),
      queryRecentInvoices(dataSource, range.from, range.to),
      queryLapsedCustomers(dataSource, range.to),
      queryInventory(dataSource, range.from, range.to, windowDays),
    ]);

  return {
    range: {
      from: effectiveFrom.toISOString(),
      to: range.to.toISOString(),
      bucket: range.bucket,
    },
    kpis,
    trend,
    paymentMix,
    customerMix: customers.mix,
    topItems,
    topCustomers,
    lapsedCustomers,
    inventory: inventory.snapshot,
    reorderList: inventory.reorderList,
    recentInvoices,
    alerts: buildAlerts(
      kpis,
      topCustomers,
      inventory.snapshot,
      inventory.reorderList,
      lapsedCustomers
    ),
    generatedAt: new Date().toISOString(),
  };
}
