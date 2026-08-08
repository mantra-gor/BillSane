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
  name: string;
  phone: string;
  email?: string;
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
