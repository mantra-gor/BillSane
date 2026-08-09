// Renderer-facing shapes for the business/invoice IPC surface. Deliberately mirror
// the existing localStorage-era `BusinessConfig` (businessConfig.ts) and
// `SavedInvoice` (invoiceStore.ts) shapes exactly, so swapping those modules'
// internals to IPC doesn't ripple into every call site's data shape.

import type { Permission } from "./permissions.js";

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

// --- Accounts, roles & permissions ------------------------------------------
// The password hash never appears in any shape below: nothing on this side of
// the bridge has a reason to hold one, so nothing can leak one.

export type { Permission, PermissionGroupInfo, PermissionInfo } from "./permissions.js";

/** Who is signed in, as every screen needs them. */
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  roleId: number;
  roleName: string;
  // True for the locked Administrator role, which the Roles screen can show but
  // not edit.
  isSystemRole: boolean;
  // Set by an admin handing out a temporary password. The app holds the user on
  // the change-password step until they clear it.
  mustChangePassword: boolean;
}

export interface AuthSession {
  user: AuthUser;
  // Resolved from the role at sign-in and re-resolved whenever a role or user
  // changes, so revoking access doesn't wait for the next launch.
  permissions: Permission[];
}

/**
 * What the app should show before anything else is decided.
 *
 * "setup" is the empty-database state: no accounts exist yet, so the only
 * screen that makes sense is the one that creates the first one.
 */
export type AuthState =
  | { status: "setup" }
  | { status: "signed-out" }
  | { status: "signed-in"; session: AuthSession };

export interface SignInInput {
  email: string;
  password: string;
  /** Persists the session across restarts — see domain/session.ts. */
  remember: boolean;
}

export interface SetupInput {
  name: string;
  email: string;
  phone: string | null;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface ProfileUpdateInput {
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
}

/**
 * Auth calls answer with a result object rather than throwing, for the reason
 * the CSV import handlers do: "Email or password is incorrect." is a sentence
 * the user reads, and an ipcInvoke rejection would wrap it in "Error invoking
 * remote method …".
 */
export type AuthResult =
  | { ok: true; session: AuthSession }
  | { ok: false; error: string };

// --- User administration ----------------------------------------------------

export interface UserSummary {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  roleId: number;
  roleName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  /** True for the signed-in user — the row they can't delete or suspend. */
  isCurrent: boolean;
}

export interface UserCreateInput {
  name: string;
  email: string;
  phone: string | null;
  roleId: number;
  password: string;
  /** Makes the password temporary: the user must replace it to get in. */
  mustChangePassword: boolean;
}

export interface UserUpdateInput {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  roleId: number;
  isActive: boolean;
}

export interface UserPasswordInput {
  id: number;
  password: string;
  mustChangePassword: boolean;
}

// --- Roles ------------------------------------------------------------------

export interface RoleSummary {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
  /** How many people hold it — a role in use can't be deleted. */
  userCount: number;
}

export interface RoleInput {
  name: string;
  description: string | null;
  permissions: Permission[];
}

export interface RoleUpdateInput extends RoleInput {
  id: number;
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

// --- Bulk import (CSV) -------------------------------------------------------
// A shop arriving with a spreadsheet shouldn't have to retype it. The flow is
// always preview-then-commit: the main process parses and matches the file
// against the catalog, the renderer shows exactly what will happen row by row,
// and nothing is written until the owner agrees to it.

/** The canonical column set. Header spellings are aliased onto these. */
export type ProductImportField =
  | "name"
  | "sku"
  | "kind"
  | "unit"
  | "hsnCode"
  | "rate"
  | "taxType"
  | "taxPer"
  | "stockQty"
  | "lowStockAt";

/**
 * What one row asks for.
 *
 * A key is present only when the sheet carried that column *and* the cell had
 * something in it. Absent therefore means "the file says nothing about this",
 * which on an update means leave the current value alone — so a sheet with only
 * name and stock columns is a stock count, not a wipe of every price.
 */
export interface ProductImportValues {
  name: string;
  sku?: string | null;
  kind?: ProductKind;
  unit?: string;
  hsnCode?: string | null;
  rate?: number | null;
  taxType?: string | null;
  taxPer?: number | null;
  stockQty?: number | null;
  lowStockAt?: number | null;
}

/**
 * `unchanged` is deliberately its own answer: re-importing last week's sheet
 * with three edits should say "3 updates, 412 unchanged", not "415 updates".
 */
export type ProductImportAction = "create" | "update" | "unchanged" | "error";

export interface ProductImportRow {
  line: number;
  action: ProductImportAction;
  values: ProductImportValues;
  /** The catalog item this row matched, by item code or folded name. */
  matchedId: number | null;
  /** The catalog's spelling, shown when it differs from the sheet's. */
  matchedName: string | null;
  /** Human labels of the fields an update would change. */
  changes: string[];
  /** Why the row can't be imported. Non-empty exactly when action is "error". */
  errors: string[];
}

export interface ProductImportColumn {
  field: ProductImportField;
  label: string;
  /** The header text as it was actually spelled in the file. */
  heading: string;
}

export interface ProductImportPreview {
  columns: ProductImportColumn[];
  /** Headers we couldn't place — surfaced so a typo is visible, not silent. */
  ignoredColumns: string[];
  rows: ProductImportRow[];
  counts: {
    total: number;
    create: number;
    update: number;
    unchanged: number;
    error: number;
  };
}

export type ProductImportPreviewResult =
  | { ok: true; preview: ProductImportPreview }
  | { ok: false; error: string };

export interface ProductImportInput {
  csv: string;
  /** false leaves items already in the catalog untouched. */
  updateExisting: boolean;
}

export type ProductImportResult =
  | { ok: true; created: number; updated: number; skipped: number }
  | { ok: false; error: string };

/** The result of a native save dialog — `canceled` is a normal outcome. */
export type SaveFileResult =
  | { ok: true; canceled: boolean; filePath: string | null }
  | { ok: false; error: string };

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

// --- Inventory on the dashboard ---
// Point-in-time, not range-bounded: what is on the shelf right now. The window
// only feeds the sales side (units sold, dead stock).

export interface InventorySnapshot {
  totalItems: number;
  // stockQty IS NULL means never counted, so it is excluded from the value.
  uncountedItems: number;
  stockValue: number;
  // low + out + oversold
  needsRestocking: number;
  outOfStock: number;
  // Counted stock with no sales at all in the window — money standing still.
  deadStockItems: number;
  deadStockValue: number;
}

export type ReorderReason = "oversold" | "out" | "low" | "soon";

export interface ReorderItem {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  stockQty: number;
  lowStockAt: number | null;
  unitsSold: number;
  // stockQty ÷ average units sold per day. null when nothing sold in the
  // window, which is why "no sales" sorts last rather than as "infinite cover".
  daysCover: number | null;
  reason: ReorderReason;
}

export interface LapsedCustomer {
  id: number;
  name: string;
  phone: string;
  invoiceCount: number;
  totalSpent: number;
  lastInvoiceAt: string;
  daysSince: number;
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
  customerMix: CustomerMix;
  topItems: TopItem[];
  topCustomers: CustomerShare[];
  lapsedCustomers: LapsedCustomer[];
  inventory: InventorySnapshot;
  reorderList: ReorderItem[];
  recentInvoices: RecentInvoice[];
  alerts: InsightAlert[];
  generatedAt: string;
}
