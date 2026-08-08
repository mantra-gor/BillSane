// Thin renderer wrapper over the main-process customer service. Types are
// derived from the preload bridge (types.d.ts) so the DTO shapes stay defined in
// exactly one place — the electron domain layer.

export type CustomerLookupInput = Parameters<
  Window["electron"]["lookupCustomers"]
>[0];
export type CustomerMatch = Awaited<
  ReturnType<Window["electron"]["lookupCustomers"]>
>[number];
export type CustomerSummary = Awaited<
  ReturnType<Window["electron"]["listCustomers"]>
>[number];
export type CustomerUpdateInput = Parameters<
  Window["electron"]["updateCustomer"]
>[0];
export type CustomerInvoice = Awaited<
  ReturnType<Window["electron"]["getCustomerInvoices"]>
>[number];

export function lookupCustomers(
  input: CustomerLookupInput
): Promise<CustomerMatch[]> {
  return window.electron.lookupCustomers(input);
}

export function listCustomers(search?: string): Promise<CustomerSummary[]> {
  return window.electron.listCustomers(search);
}

export function getCustomerInvoices(id: number): Promise<CustomerInvoice[]> {
  return window.electron.getCustomerInvoices(id);
}

export async function updateCustomer(input: CustomerUpdateInput): Promise<void> {
  const result = await window.electron.updateCustomer(input);
  if (!result.ok) throw new Error(result.error);
}

export async function deleteCustomer(id: number): Promise<void> {
  const result = await window.electron.deleteCustomer(id);
  if (!result.ok) throw new Error(result.error);
}

/** "12 invoices · ₹45,320 · last visit 12 Jul" — the trust line on a match. */
export function customerInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function formatLastVisit(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
