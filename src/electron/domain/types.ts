// Renderer-facing shapes for the business/invoice IPC surface. Deliberately mirror
// the existing localStorage-era `BusinessConfig` (businessConfig.ts) and
// `SavedInvoice` (invoiceStore.ts) shapes exactly, so swapping those modules'
// internals to IPC doesn't ripple into every call site's data shape.

export interface BusinessConfig {
  companyName: string;
  phone: string;
  email: string;
  gstNo: string;
  address: string;
  logo: string;
}

export interface InvoiceCustomerDetails {
  // Set once the till has linked the invoice to an existing customer record.
  // When present it, not the phone number, decides identity — that is what lets
  // a returning customer's new number overwrite the one on file instead of
  // silently creating a second record for the same person.
  id?: number;
  name: string;
  phone: string;
  email?: string;
}

// --- Customers --------------------------------------------------------------

export type CustomerMatchField = "phone" | "email";

export interface CustomerSummary {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  // Trading history, aggregated in SQL — the till shows it so the owner can
  // tell a regular from a one-off before deciding to merge or start fresh.
  invoiceCount: number;
  totalSpent: number;
  lastInvoiceAt: string | null;
}

export interface CustomerMatch extends CustomerSummary {
  // Which field(s) hit. A phone-only match on a customer whose email differs is
  // the "they changed address" case; email-only is "they changed number".
  matchedOn: CustomerMatchField[];
}

export interface CustomerLookupInput {
  phone?: string;
  email?: string;
}

export interface CustomerUpdateInput {
  id: number;
  name: string;
  phone: string;
  email: string | null;
}

// --- Products / inventory ---------------------------------------------------

export type ProductKind = "product" | "service";

/**
 * The lean shape the invoice dropdown works with — everything needed to fill a
 * line and nothing else, because this is fetched on every keystroke.
 */
export interface ProductOption {
  id: number;
  name: string;
  sku: string | null;
  kind: ProductKind;
  unit: string;
  hsnCode: string | null;
  rate: number | null;
  taxType: string | null;
  taxPer: number | null;
  // null = never counted. The Inventory page says so rather than showing "0".
  stockQty: number | null;
  lowStockAt: number | null;
}

/** A catalog row plus what it has actually sold — the Inventory table. */
export interface ProductSummary extends ProductOption {
  unitsSold: number;
  revenue: number;
  lastSoldAt: string | null;
}

export interface ProductInput {
  name: string;
  sku: string | null;
  kind: ProductKind;
  unit: string;
  hsnCode: string | null;
  rate: number | null;
  taxType: string | null;
  taxPer: number | null;
  stockQty: number | null;
  lowStockAt: number | null;
}

export interface ProductUpdateInput extends ProductInput {
  id: number;
}

export interface SavedInvoice {
  id: string;
  invoiceNo: string;
  date: string;
  createdAt: string;
  customerDetails: InvoiceCustomerDetails;
  lineItems: LineItem[];
  totalAmount?: number;
  totalTax?: number;
  totalDiscount?: number;
  payment_type: string;
}

export type SavedInvoiceInput = Omit<SavedInvoice, "id" | "invoiceNo" | "createdAt">;

// --- Dashboard insights ---
// Aggregates are computed in SQL in the main process (domain/insights.ts) and
// shipped as one compact bundle per range, so the renderer never has to pull
// every invoice + line item across the bridge just to draw KPIs and charts.

export type InsightsRangeToken = "7d" | "30d" | "90d" | "1y" | "all";

export interface InsightsRangeInput {
  token: InsightsRangeToken;
  // Optional custom window; when provided it overrides the token's span.
  from?: string;
  to?: string;
}

// A single KPI: the current-period value plus its % change vs. the previous
// equal-length window. `deltaPct` is null when there is no comparable prior
// period (e.g. the "all" range, or a prior window with zero revenue).
export interface KpiValue {
  value: number;
  deltaPct: number | null;
}

export interface DashboardKpis {
  revenue: KpiValue;
  invoiceCount: KpiValue;
  taxCollected: KpiValue;
  avgInvoice: KpiValue;
  // --- Customer health ---
  // Distinct customers billed in the window.
  activeCustomers: KpiValue;
  // Customers whose *first ever* invoice falls in the window — acquisition.
  newCustomers: KpiValue;
  // Share of the window's invoices that were not a customer's first purchase.
  // Defined per-invoice rather than per-customer so it stays meaningful on
  // every range, including "all" (where every customer is technically new).
  repeatRatePct: KpiValue;
  // Revenue ÷ active customers — what one customer is worth in this window.
  avgCustomerValue: KpiValue;
}

// Revenue split by whether a purchase was a customer's first. Both sides are a
// clean partition of the window's invoices, so the pair always sums to the
// window's revenue and invoice count.
export interface CustomerMixSide {
  invoices: number;
  revenue: number;
}

export interface CustomerMix {
  firstTime: CustomerMixSide;
  returning: CustomerMixSide;
}

export interface TrendPoint {
  // ISO start of the bucket (sortable); `label` is the pre-formatted axis tick.
  bucket: string;
  label: string;
  revenue: number;
  count: number;
}

export interface PaymentSlice {
  type: string;
  amount: number;
  count: number;
}

export interface TopItem {
  itemName: string;
  qty: number;
  revenue: number;
}

export interface CustomerShare {
  name: string;
  phone: string;
  revenue: number;
  invoiceCount: number;
  sharePct: number;
}

export type InsightAlertLevel = "info" | "warning";

export interface InsightAlert {
  id: string;
  level: InsightAlertLevel;
  title: string;
  detail: string;
}

// Lightweight row for the dashboard's "recent activity" preview — deliberately
// omits line items so the bundle stays small (the full ledger lives on /sales).
export interface RecentInvoice {
  id: string;
  invoiceNo: string;
  date: string;
  customerName: string;
  totalAmount: number;
  paymentType: string;
}

export type InsightsBucket = "day" | "week" | "month";

export interface DashboardInsights {
  range: {
    from: string;
    to: string;
    bucket: InsightsBucket;
  };
  kpis: DashboardKpis;
  trend: TrendPoint[];
  paymentMix: PaymentSlice[];
  topItems: TopItem[];
  topCustomers: CustomerShare[];
  recentInvoices: RecentInvoice[];
  alerts: InsightAlert[];
  generatedAt: string;
}
