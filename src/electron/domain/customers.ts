import { DataSource, SelectQueryBuilder } from "typeorm";
import { Customer, Invoice } from "../db/entities/index.js";
import type {
  CustomerLookupInput,
  CustomerMatch,
  CustomerMatchField,
  CustomerSummary,
  RecentInvoice,
} from "./types.js";

// A counter lookup should surface the handful of people who could plausibly be
// standing there, not a page of them — anything longer means the operator is
// better off searching the directory.
const MATCH_LIMIT = 5;
const LIST_LIMIT = 200;
const HISTORY_LIMIT = 50;

// pg returns SUM()/COUNT() as strings; better-sqlite3 as numbers.
function num(value: unknown): number {
  const n = value == null ? 0 : Number(value);
  return Number.isFinite(n) ? n : 0;
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
 * Emails are compared as a natural key, so they are stored folded to lowercase
 * and matched exactly — `LOWER(email) = ?` would read the same but would throw
 * away the index this lookup exists to use.
 */
export function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

interface CustomerRow {
  id: unknown;
  name: string;
  phone: string;
  email: string | null;
  invoiceCount: unknown;
  totalSpent: unknown;
  lastInvoiceAt: unknown;
}

/**
 * One customer row plus its trading history. Left-joined so a customer with no
 * invoices (possible once the directory can edit records) still appears.
 */
function customerQuery(dataSource: DataSource): SelectQueryBuilder<Customer> {
  return dataSource
    .getRepository(Customer)
    .createQueryBuilder("customer")
    .leftJoin("customer.invoices", "invoice")
    .select("customer.id", "id")
    .addSelect("customer.name", "name")
    .addSelect("customer.phone", "phone")
    .addSelect("customer.email", "email")
    .addSelect("COUNT(invoice.id)", "invoiceCount")
    .addSelect("COALESCE(SUM(invoice.totalAmount), 0)", "totalSpent")
    .addSelect("MAX(invoice.createdAt)", "lastInvoiceAt")
    .groupBy("customer.id")
    .addGroupBy("customer.name")
    .addGroupBy("customer.phone")
    .addGroupBy("customer.email");
}

function toSummary(row: CustomerRow): CustomerSummary {
  return {
    id: num(row.id),
    name: row.name,
    phone: row.phone,
    email: row.email,
    invoiceCount: num(row.invoiceCount),
    totalSpent: round(num(row.totalSpent)),
    lastInvoiceAt: toIso(row.lastInvoiceAt),
  };
}

/**
 * Resolve who is at the counter from whatever contact detail has been typed so
 * far. Phone and email are OR'd rather than AND'd on purpose: the whole point is
 * to still recognise someone who has changed one of the two.
 */
export async function lookupCustomers(
  dataSource: DataSource,
  input: CustomerLookupInput
): Promise<CustomerMatch[]> {
  const phone = input.phone?.trim() ?? "";
  const email = normalizeEmail(input.email) ?? "";
  if (!phone && !email) return [];

  const qb = customerQuery(dataSource);
  if (phone && email) {
    qb.where("customer.phone = :phone OR customer.email = :email", { phone, email });
  } else if (phone) {
    qb.where("customer.phone = :phone", { phone });
  } else {
    qb.where("customer.email = :email", { email });
  }

  const rows = await qb
    .orderBy("MAX(invoice.createdAt)", "DESC", "NULLS LAST")
    .limit(MATCH_LIMIT)
    .getRawMany<CustomerRow>();

  return rows.map((row) => {
    const summary = toSummary(row);
    const matchedOn: CustomerMatchField[] = [];
    if (phone && summary.phone === phone) matchedOn.push("phone");
    if (email && summary.email === email) matchedOn.push("email");
    return { ...summary, matchedOn };
  });
}

export async function listCustomers(
  dataSource: DataSource,
  search?: string
): Promise<CustomerSummary[]> {
  const qb = customerQuery(dataSource);

  const term = search?.trim().toLowerCase();
  if (term) {
    qb.where(
      "LOWER(customer.name) LIKE :term OR customer.phone LIKE :term OR customer.email LIKE :term",
      { term: `%${term}%` }
    );
  }

  const rows = await qb
    .orderBy("MAX(invoice.createdAt)", "DESC", "NULLS LAST")
    .limit(LIST_LIMIT)
    .getRawMany<CustomerRow>();
  return rows.map(toSummary);
}

/** Invoice history for one customer — the directory's detail panel. */
export async function listCustomerInvoices(
  dataSource: DataSource,
  customerId: number
): Promise<RecentInvoice[]> {
  const rows = await dataSource
    .getRepository(Invoice)
    .createQueryBuilder("invoice")
    .innerJoin("invoice.customer", "customer")
    .select("invoice.id", "id")
    .addSelect("invoice.invoiceNo", "invoiceNo")
    .addSelect("invoice.date", "date")
    .addSelect("customer.name", "customerName")
    .addSelect("COALESCE(invoice.totalAmount, 0)", "totalAmount")
    .addSelect("invoice.paymentType", "paymentType")
    .where("customer.id = :customerId", { customerId })
    .orderBy("invoice.createdAt", "DESC")
    .limit(HISTORY_LIMIT)
    .getRawMany<{
      id: string;
      invoiceNo: string;
      date: string;
      customerName: string;
      totalAmount: unknown;
      paymentType: string;
    }>();

  return rows.map((row) => ({
    id: row.id,
    invoiceNo: row.invoiceNo,
    date: row.date,
    customerName: row.customerName,
    totalAmount: round(num(row.totalAmount)),
    paymentType: row.paymentType,
  }));
}
