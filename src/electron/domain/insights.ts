import { DataSource } from "typeorm";
import { Invoice, InvoiceLineItem } from "../db/entities/index.js";
import type {
  CustomerShare,
  DashboardInsights,
  DashboardKpis,
  InsightAlert,
  InsightsBucket,
  InsightsRangeInput,
  KpiValue,
  PaymentSlice,
  RecentInvoice,
  TopItem,
  TrendPoint,
} from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_LIMIT = 5;

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

function toKpis(current: Totals, previous: Totals | null): DashboardKpis {
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

// --- Trend (bucketed in JS from a narrow projection) ------------------------

interface RawTrendRow {
  createdAt: unknown;
  amount: unknown;
}

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

async function queryTrend(
  dataSource: DataSource,
  range: ResolvedRange
): Promise<TrendPoint[]> {
  const qb = dataSource
    .getRepository(Invoice)
    .createQueryBuilder("invoice")
    .select("invoice.createdAt", "createdAt")
    .addSelect("invoice.totalAmount", "amount")
    .where("invoice.createdAt <= :to", { to: range.to })
    .orderBy("invoice.createdAt", "ASC");
  if (range.from) qb.andWhere("invoice.createdAt >= :from", { from: range.from });

  const rows = await qb.getRawMany<RawTrendRow>();
  const dates = rows.map((r) => new Date(r.createdAt as string | number | Date));

  // Axis spans the resolved window; for "all" (no lower bound) it starts at the
  // earliest invoice so the chart isn't padded with empty buckets.
  const axisStart = range.from ?? (dates.length ? dates[0] : range.to);

  const points = new Map<string, TrendPoint>();
  for (
    let cursor = bucketStart(axisStart, range.bucket);
    cursor.getTime() <= range.to.getTime();
    cursor = advance(cursor, range.bucket)
  ) {
    const key = cursor.toISOString();
    points.set(key, { bucket: key, label: bucketLabel(cursor, range.bucket), revenue: 0, count: 0 });
  }

  rows.forEach((row, i) => {
    const key = bucketStart(dates[i], range.bucket).toISOString();
    const point = points.get(key);
    if (!point) return; // outside the generated axis (shouldn't happen)
    point.revenue = round(point.revenue + num(row.amount));
    point.count += 1;
  });

  return [...points.values()];
}

// --- Alerts -----------------------------------------------------------------

function buildAlerts(
  kpis: DashboardKpis,
  topCustomers: CustomerShare[]
): InsightAlert[] {
  const alerts: InsightAlert[] = [];

  if (kpis.invoiceCount.value === 0) {
    alerts.push({
      id: "no-sales",
      level: "info",
      title: "No sales in this period",
      detail: "Create an invoice to start tracking revenue here.",
    });
    return alerts;
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

  if (kpis.taxCollected.value > 0) {
    alerts.push({
      id: "tax-due",
      level: "info",
      title: "GST set-aside",
      detail: `₹${kpis.taxCollected.value.toLocaleString("en-IN")} in tax collected this period — reserve it for filing.`,
    });
  }

  return alerts;
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

  const kpis = toKpis(current, previous);

  const [paymentMix, topItems, topCustomers, trend, recentInvoices] =
    await Promise.all([
      queryPaymentMix(dataSource, range.from, range.to),
      queryTopItems(dataSource, range.from, range.to),
      queryTopCustomers(dataSource, range.from, range.to, current.revenue),
      queryTrend(dataSource, range),
      queryRecentInvoices(dataSource, range.from, range.to),
    ]);

  // For "all", the effective start is the earliest bucket the trend produced.
  const effectiveFrom =
    range.from ?? (trend.length ? new Date(trend[0].bucket) : range.to);

  return {
    range: {
      from: effectiveFrom.toISOString(),
      to: range.to.toISOString(),
      bucket: range.bucket,
    },
    kpis,
    trend,
    paymentMix,
    topItems,
    topCustomers,
    recentInvoices,
    alerts: buildAlerts(kpis, topCustomers),
    generatedAt: new Date().toISOString(),
  };
}
