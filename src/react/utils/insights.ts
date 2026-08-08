// Thin renderer wrapper over the main-process insights aggregation service.
// Types are derived from the preload bridge (types.d.ts) so the DTO shapes stay
// defined in exactly one place — the electron domain layer.

export type InsightsRangeInput = Parameters<
  Window["electron"]["getDashboardInsights"]
>[0];
export type InsightsRangeToken = InsightsRangeInput["token"];
export type DashboardInsights = Awaited<
  ReturnType<Window["electron"]["getDashboardInsights"]>
>;
export type DashboardKpis = DashboardInsights["kpis"];
export type KpiValue = DashboardKpis["revenue"];
export type TrendPoint = DashboardInsights["trend"][number];
export type PaymentSlice = DashboardInsights["paymentMix"][number];
export type TopItem = DashboardInsights["topItems"][number];
export type CustomerShare = DashboardInsights["topCustomers"][number];
export type RecentInvoice = DashboardInsights["recentInvoices"][number];
export type InsightAlert = DashboardInsights["alerts"][number];

export function getDashboardInsights(
  range: InsightsRangeInput
): Promise<DashboardInsights> {
  return window.electron.getDashboardInsights(range);
}
