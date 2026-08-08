import fs from "fs";
import path from "path";
import { Like, Repository } from "typeorm";
import { ipcHandle } from "../util.js";
import { getUserDataPath } from "../pathResolver.js";
import { getDataSource } from "../db/connectionManager.js";
import { Business, Customer, Invoice, InvoiceLineItem, Product } from "../db/entities/index.js";
import type {
  BusinessConfig,
  CustomerMatch,
  CustomerSummary,
  DashboardInsights,
  ProductOption,
  ProductSummary,
  RecentInvoice,
  SavedInvoice,
  SavedInvoiceInput,
  InvoiceCustomerDetails,
} from "../domain/types.js";
import type { DbOperationResult } from "../db/types.js";
import { getDashboardInsights } from "../domain/insights.js";
import {
  listCustomerInvoices,
  listCustomers,
  lookupCustomers,
  normalizeEmail,
} from "../domain/customers.js";
import {
  applyStockDelta,
  createProduct,
  listProducts,
  resolveLineProducts,
  searchProducts,
  stockDeltas,
  updateProduct,
} from "../domain/products.js";

function requireDataSource() {
  const dataSource = getDataSource();
  if (!dataSource) {
    throw new Error("Database is not connected yet. Check Settings > Database.");
  }
  return dataSource;
}

function toErrorResult(err: unknown): DbOperationResult {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

// --- Business (single row, id always 1) ---

async function getOrCreateBusinessRow(repo: Repository<Business>): Promise<Business> {
  const existing = await repo.findOne({ where: { id: 1 } });
  if (existing) return existing;
  return repo.save(repo.create({ id: 1 }));
}

function getLogoFilePath(): string {
  return path.join(getUserDataPath(), "business-logo.txt");
}

async function readLogoFile(): Promise<string> {
  try {
    return await fs.promises.readFile(getLogoFilePath(), "utf-8");
  } catch {
    return "";
  }
}

async function writeLogoFile(dataUrl: string | null): Promise<void> {
  const filePath = getLogoFilePath();
  if (!dataUrl) {
    await fs.promises.rm(filePath, { force: true });
    return;
  }
  await fs.promises.writeFile(filePath, dataUrl, "utf-8");
}

// --- Invoice mapping helpers ---

/**
 * Decide which customer row an invoice belongs to.
 *
 * An explicit `details.id` means the operator already identified this person at
 * the counter, so that record wins and the typed values are written onto it —
 * including a changed phone number. That is what stops a regular who switched
 * numbers from accumulating a second record.
 *
 * With no id the phone number is the identity, which is the walk-in path.
 */
async function resolveCustomer(
  repo: Repository<Customer>,
  details: InvoiceCustomerDetails
): Promise<Customer> {
  const email = normalizeEmail(details.email);

  if (details.id != null) {
    const linked = await repo.findOne({ where: { id: details.id } });
    if (linked) {
      // phone is unique. If the new number is already on file under someone
      // else, the operator has linked one person and typed another's number —
      // refuse rather than silently move the number or merge two histories.
      const clash = await repo.findOne({ where: { phone: details.phone } });
      if (clash && clash.id !== linked.id) {
        throw new Error(
          `${details.phone} is already on file for ${clash.name}. Link that customer instead, or use a different number.`
        );
      }
      linked.name = details.name;
      linked.phone = details.phone;
      linked.email = email;
      return repo.save(linked);
    }
  }

  const existing = await repo.findOne({ where: { phone: details.phone } });
  if (existing) {
    existing.name = details.name;
    existing.email = email;
    return repo.save(existing);
  }
  return repo.save(repo.create({ name: details.name, phone: details.phone, email }));
}

async function generateInvoiceNo(repo: Repository<Invoice>): Promise<string> {
  const yearMonth = new Date().toISOString().slice(2, 7).replace("-", "");
  const sameMonthCount = await repo.count({ where: { invoiceNo: Like(`${yearMonth}%`) } });
  return `${yearMonth}${String(sameMonthCount + 1).padStart(5, "0")}`;
}

function toSavedInvoice(invoice: Invoice): SavedInvoice {
  return {
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    date: invoice.date,
    createdAt: invoice.createdAt.toISOString(),
    customerDetails: {
      id: invoice.customer.id,
      name: invoice.customer.name,
      phone: invoice.customer.phone,
      email: invoice.customer.email ?? undefined,
    },
    lineItems: invoice.lineItems.map((item) => ({
      id: item.id,
      productId: item.productId ?? undefined,
      itemName: item.itemName ?? undefined,
      rate: item.rate ?? undefined,
      taxType: item.taxType ?? undefined,
      taxPer: item.taxPer ?? undefined,
      qty: item.qty ?? undefined,
      tax: item.tax ?? undefined,
      subTotal: item.subTotal ?? undefined,
    })),
    totalAmount: invoice.totalAmount ?? undefined,
    totalTax: invoice.totalTax ?? undefined,
    totalDiscount: invoice.totalDiscount ?? undefined,
    payment_type: invoice.paymentType,
  };
}

export function registerDomainIpcHandlers(): void {
  ipcHandle("business:get", async (): Promise<BusinessConfig> => {
    const repo = requireDataSource().getRepository(Business);
    const row = await getOrCreateBusinessRow(repo);
    const logo = await readLogoFile();
    return {
      companyName: row.companyName,
      phone: row.phone,
      email: row.email,
      gstNo: row.gstNo,
      address: row.address,
      logo,
    };
  });

  ipcHandle("business:save", async (input): Promise<DbOperationResult> => {
    try {
      const repo = requireDataSource().getRepository(Business);
      const row = await getOrCreateBusinessRow(repo);
      Object.assign(row, input);
      await repo.save(row);
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });

  ipcHandle("business:saveLogo", async (dataUrl): Promise<DbOperationResult> => {
    try {
      await writeLogoFile(dataUrl);
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });

  ipcHandle("invoice:list", async (): Promise<SavedInvoice[]> => {
    const invoices = await requireDataSource()
      .getRepository(Invoice)
      .find({ relations: { customer: true, lineItems: true }, order: { createdAt: "DESC" } });
    return invoices.map(toSavedInvoice);
  });

  ipcHandle("invoice:get", async (id): Promise<SavedInvoice | undefined> => {
    const invoice = await requireDataSource()
      .getRepository(Invoice)
      .findOne({ where: { id }, relations: { customer: true, lineItems: true } });
    return invoice ? toSavedInvoice(invoice) : undefined;
  });

  // One transaction, because this write has three side effects that only make
  // sense together: the customer record, the invoice itself, and the stock it
  // takes off the shelf. A half-applied save would leave a deducted-but-unsold
  // unit, or an item in the catalog no invoice ever mentions.
  //
  // Note this does not make `generateInvoiceNo` race-free — that count-based
  // scheme is unchanged; the window is just narrower.
  ipcHandle("invoice:create", async (input: SavedInvoiceInput): Promise<SavedInvoice> => {
    const dataSource = requireDataSource();

    const savedId = await dataSource.transaction(async (manager) => {
      const customer = await resolveCustomer(
        manager.getRepository(Customer),
        input.customerDetails
      );
      const invoiceRepo = manager.getRepository(Invoice);
      const invoiceNo = await generateInvoiceNo(invoiceRepo);
      // Links each line to a catalog item, creating what the counter typed but
      // never picked — that is how inventory learns a new product.
      const products = await resolveLineProducts(manager, input.lineItems);

      const saved = await invoiceRepo.save(
        invoiceRepo.create({
          invoiceNo,
          date: input.date,
          customer,
          paymentType: input.payment_type,
          totalAmount: input.totalAmount ?? null,
          totalTax: input.totalTax ?? null,
          totalDiscount: input.totalDiscount ?? null,
          lineItems: input.lineItems.map(
            (item, index): Partial<InvoiceLineItem> => ({
              productId: products[index]?.id ?? null,
              itemName: item.itemName ?? null,
              taxType: item.taxType ?? null,
              rate: item.rate ?? null,
              taxPer: item.taxPer ?? null,
              qty: item.qty ?? null,
              tax: item.tax ?? null,
              subTotal: item.subTotal ?? null,
            })
          ),
        })
      );

      await applyStockDelta(manager, stockDeltas(input.lineItems, products, -1));
      return saved.id;
    });

    const withRelations = await dataSource.getRepository(Invoice).findOneOrFail({
      where: { id: savedId },
      relations: { customer: true, lineItems: true },
    });
    return toSavedInvoice(withRelations);
  });

  ipcHandle("invoice:delete", async (id): Promise<DbOperationResult> => {
    try {
      await requireDataSource().transaction(async (manager) => {
        const invoiceRepo = manager.getRepository(Invoice);
        // Read the lines before deleting them: cancelling a sale puts the goods
        // back, and once the cascade has run there is nothing left to put back.
        const invoice = await invoiceRepo.findOne({
          where: { id },
          relations: { lineItems: true },
        });
        if (!invoice) return;

        const deltas = new Map<number, number>();
        for (const item of invoice.lineItems) {
          if (item.productId == null) continue;
          const qty = item.qty ?? 0;
          if (!Number.isFinite(qty) || qty === 0) continue;
          deltas.set(item.productId, (deltas.get(item.productId) ?? 0) + qty);
        }

        await invoiceRepo.delete(id);
        await applyStockDelta(manager, deltas);
      });
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });

  ipcHandle("customer:lookup", (input): Promise<CustomerMatch[]> => {
    return lookupCustomers(requireDataSource(), input);
  });

  ipcHandle("customer:list", (search): Promise<CustomerSummary[]> => {
    return listCustomers(requireDataSource(), search);
  });

  ipcHandle("customer:invoices", (id): Promise<RecentInvoice[]> => {
    return listCustomerInvoices(requireDataSource(), id);
  });

  ipcHandle("customer:update", async (input): Promise<DbOperationResult> => {
    try {
      const repo = requireDataSource().getRepository(Customer);
      const row = await repo.findOne({ where: { id: input.id } });
      if (!row) throw new Error("That customer no longer exists.");

      const clash = await repo.findOne({ where: { phone: input.phone } });
      if (clash && clash.id !== row.id) {
        throw new Error(`${input.phone} is already on file for ${clash.name}.`);
      }

      row.name = input.name;
      row.phone = input.phone;
      row.email = normalizeEmail(input.email);
      await repo.save(row);
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });

  ipcHandle("customer:delete", async (id): Promise<DbOperationResult> => {
    try {
      const dataSource = requireDataSource();
      // The invoice FK is ON DELETE RESTRICT, so the driver would reject this
      // with an opaque constraint error. Check first and say why in business
      // terms — an invoice must keep the customer it was billed to.
      const billed = await dataSource
        .getRepository(Invoice)
        .count({ where: { customer: { id } } });
      if (billed > 0) {
        throw new Error(
          `This customer has ${billed} invoice${billed === 1 ? "" : "s"} and can't be deleted.`
        );
      }
      await dataSource.getRepository(Customer).delete(id);
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });

  ipcHandle("product:search", (query): Promise<ProductOption[]> => {
    return searchProducts(requireDataSource(), query);
  });

  ipcHandle("product:list", (search): Promise<ProductSummary[]> => {
    return listProducts(requireDataSource(), search);
  });

  ipcHandle("product:create", async (input): Promise<DbOperationResult> => {
    try {
      await createProduct(requireDataSource(), input);
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });

  ipcHandle("product:update", async (input): Promise<DbOperationResult> => {
    try {
      await updateProduct(requireDataSource(), input);
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });

  // No invoice-count guard, unlike customer:delete. The line item's FK is
  // ON DELETE SET NULL and everything an invoice prints is snapshotted on the
  // line, so retiring a catalog entry costs history nothing.
  ipcHandle("product:delete", async (id): Promise<DbOperationResult> => {
    try {
      await requireDataSource().getRepository(Product).delete(id);
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });

  ipcHandle("insights:dashboard", (range): Promise<DashboardInsights> => {
    return getDashboardInsights(requireDataSource(), range);
  });
}
