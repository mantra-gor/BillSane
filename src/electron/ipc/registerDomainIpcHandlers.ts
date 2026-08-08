import fs from "fs";
import path from "path";
import { Like, Repository } from "typeorm";
import { ipcHandle } from "../util.js";
import { getUserDataPath } from "../pathResolver.js";
import { getDataSource } from "../db/connectionManager.js";
import { Business, Customer, Invoice, InvoiceLineItem } from "../db/entities/index.js";
import type {
  BusinessConfig,
  DashboardInsights,
  SavedInvoice,
  SavedInvoiceInput,
  InvoiceCustomerDetails,
} from "../domain/types.js";
import type { DbOperationResult } from "../db/types.js";
import { getDashboardInsights } from "../domain/insights.js";

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

async function upsertCustomer(
  repo: Repository<Customer>,
  details: InvoiceCustomerDetails
): Promise<Customer> {
  const existing = await repo.findOne({ where: { phone: details.phone } });
  if (existing) {
    existing.name = details.name;
    existing.email = details.email ?? null;
    return repo.save(existing);
  }
  return repo.save(repo.create({ name: details.name, phone: details.phone, email: details.email ?? null }));
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
      name: invoice.customer.name,
      phone: invoice.customer.phone,
      email: invoice.customer.email ?? undefined,
    },
    lineItems: invoice.lineItems.map((item) => ({
      id: item.id,
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

  ipcHandle("invoice:create", async (input: SavedInvoiceInput): Promise<SavedInvoice> => {
    const dataSource = requireDataSource();
    const customerRepo = dataSource.getRepository(Customer);
    const invoiceRepo = dataSource.getRepository(Invoice);

    const customer = await upsertCustomer(customerRepo, input.customerDetails);
    const invoiceNo = await generateInvoiceNo(invoiceRepo);

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
          (item): Partial<InvoiceLineItem> => ({
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

    const withRelations = await invoiceRepo.findOneOrFail({
      where: { id: saved.id },
      relations: { customer: true, lineItems: true },
    });
    return toSavedInvoice(withRelations);
  });

  ipcHandle("invoice:delete", async (id): Promise<DbOperationResult> => {
    try {
      await requireDataSource().getRepository(Invoice).delete(id);
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });

  ipcHandle("insights:dashboard", (range): Promise<DashboardInsights> => {
    return getDashboardInsights(requireDataSource(), range);
  });
}
