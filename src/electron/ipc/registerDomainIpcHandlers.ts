import fs from "fs";
import path from "path";
import { BrowserWindow, app, dialog, shell } from "electron";
import { Like, Repository } from "typeorm";
import { ipcHandleAuthenticated, ipcHandleGuarded } from "./guard.js";
import { getUserDataPath } from "../pathResolver.js";
import { getDataSource } from "../db/connectionManager.js";
import { Business, Customer, Invoice, InvoiceLineItem, Product } from "../db/entities/index.js";
import type {
  BusinessConfig,
  CustomerMatch,
  CustomerSummary,
  DashboardInsights,
  ProductImportPreviewResult,
  ProductImportResult,
  ProductOption,
  ProductSummary,
  RecentInvoice,
  SaveFileResult,
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
import {
  IMPORT_TEMPLATE_CSV,
  importProducts,
  previewProductImport,
} from "../domain/productImport.js";

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
  // Readable by anyone signed in: these are the details printed at the top of
  // every invoice, so the counter needs them without being able to edit them.
  ipcHandleAuthenticated("business:get", async (): Promise<BusinessConfig> => {
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

  ipcHandleGuarded("business:save", ["settings:business"], async (input): Promise<DbOperationResult> => {
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

  ipcHandleGuarded("business:saveLogo", ["settings:business"], async (dataUrl): Promise<DbOperationResult> => {
    try {
      await writeLogoFile(dataUrl);
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });

  ipcHandleGuarded("invoice:list", ["invoice:view"], async (): Promise<SavedInvoice[]> => {
    const invoices = await requireDataSource()
      .getRepository(Invoice)
      .find({ relations: { customer: true, lineItems: true }, order: { createdAt: "DESC" } });
    return invoices.map(toSavedInvoice);
  });

  // `invoice:create` is enough to re-open one: a customer asking for a second
  // copy a minute after paying is an ordinary counter request, and a cashier
  // who just printed the bill gains nothing by being refused it.
  ipcHandleGuarded("invoice:get", ["invoice:view", "invoice:create"], async (id): Promise<SavedInvoice | undefined> => {
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
  ipcHandleGuarded("invoice:create", ["invoice:create"], async (input: SavedInvoiceInput): Promise<SavedInvoice> => {
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

  ipcHandleGuarded("invoice:delete", ["invoice:delete"], async (id): Promise<DbOperationResult> => {
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

  ipcHandleGuarded("customer:lookup", ["invoice:create", "customer:view"], (input): Promise<CustomerMatch[]> => {
    return lookupCustomers(requireDataSource(), input);
  });

  ipcHandleGuarded("customer:list", ["customer:view"], (search): Promise<CustomerSummary[]> => {
    return listCustomers(requireDataSource(), search);
  });

  ipcHandleGuarded("customer:invoices", ["customer:view"], (id): Promise<RecentInvoice[]> => {
    return listCustomerInvoices(requireDataSource(), id);
  });

  ipcHandleGuarded("customer:update", ["customer:manage"], async (input): Promise<DbOperationResult> => {
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

  ipcHandleGuarded("customer:delete", ["customer:manage"], async (id): Promise<DbOperationResult> => {
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

  ipcHandleGuarded("product:search", ["invoice:create", "inventory:view"], (query): Promise<ProductOption[]> => {
    return searchProducts(requireDataSource(), query);
  });

  ipcHandleGuarded("product:list", ["inventory:view"], (search): Promise<ProductSummary[]> => {
    return listProducts(requireDataSource(), search);
  });

  ipcHandleGuarded("product:create", ["inventory:manage"], async (input): Promise<DbOperationResult> => {
    try {
      await createProduct(requireDataSource(), input);
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });

  ipcHandleGuarded("product:update", ["inventory:manage"], async (input): Promise<DbOperationResult> => {
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
  ipcHandleGuarded("product:delete", ["inventory:manage"], async (id): Promise<DbOperationResult> => {
    try {
      await requireDataSource().getRepository(Product).delete(id);
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });

  // Bulk import. Both halves answer with a result object rather than throwing:
  // an ipcInvoke rejection reaches the renderer wrapped in "Error invoking
  // remote method …", and "That file is empty." is a sentence the owner should
  // read on its own.
  ipcHandleGuarded("product:importPreview", ["inventory:manage"], async (csv): Promise<ProductImportPreviewResult> => {
    try {
      return { ok: true, preview: await previewProductImport(requireDataSource(), csv) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcHandleGuarded("product:import", ["inventory:manage"], async (input): Promise<ProductImportResult> => {
    try {
      const counts = await importProducts(requireDataSource(), input);
      return { ok: true, ...counts };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // The example file goes through a native save dialog rather than a renderer
  // blob download: this is a desktop app, and the owner should end up with a
  // file in Downloads that Excel opens, revealed in the file manager.
  ipcHandleGuarded("product:importTemplate", ["inventory:manage"], async (): Promise<SaveFileResult> => {
    try {
      const parent = BrowserWindow.getFocusedWindow();
      const options = {
        title: "Save example inventory file",
        defaultPath: path.join(app.getPath("downloads"), "billsane-inventory-example.csv"),
        filters: [{ name: "CSV", extensions: ["csv"] }],
      };
      const { canceled, filePath } = parent
        ? await dialog.showSaveDialog(parent, options)
        : await dialog.showSaveDialog(options);

      if (canceled || !filePath) return { ok: true, canceled: true, filePath: null };

      await fs.promises.writeFile(filePath, IMPORT_TEMPLATE_CSV, "utf-8");
      shell.showItemInFolder(filePath);
      return { ok: true, canceled: false, filePath };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcHandleGuarded("insights:dashboard", ["dashboard:view"], (range): Promise<DashboardInsights> => {
    return getDashboardInsights(requireDataSource(), range);
  });
}
