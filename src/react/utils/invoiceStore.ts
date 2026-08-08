export interface InvoiceCustomerDetails {
  // The customer record this invoice is billed to. Set when the till resolved
  // an existing customer; absent for a walk-in, where the phone number decides.
  id?: number;
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

export function getInvoices(): Promise<SavedInvoice[]> {
  return window.electron.getInvoices();
}

export function getInvoiceById(id: string): Promise<SavedInvoice | undefined> {
  return window.electron.getInvoiceById(id);
}

export async function deleteInvoice(id: string): Promise<void> {
  const result = await window.electron.deleteInvoice(id);
  if (!result.ok) throw new Error(result.error);
}

export function saveInvoice(
  invoice: Omit<SavedInvoice, "id" | "invoiceNo" | "createdAt">
): Promise<SavedInvoice> {
  return window.electron.createInvoice(invoice);
}
