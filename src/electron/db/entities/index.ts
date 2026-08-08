import { Business } from "./Business.js";
import { Customer } from "./Customer.js";
import { Invoice } from "./Invoice.js";
import { InvoiceLineItem } from "./InvoiceLineItem.js";
import { Product } from "./Product.js";

export { Business, Customer, Invoice, InvoiceLineItem, Product };
export type { ProductKind } from "./Product.js";

export const entities = [Business, Customer, Invoice, InvoiceLineItem, Product];
