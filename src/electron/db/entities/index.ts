import { Business } from "./Business.js";
import { Customer } from "./Customer.js";
import { Invoice } from "./Invoice.js";
import { InvoiceLineItem } from "./InvoiceLineItem.js";
import { Product } from "./Product.js";
import { Role } from "./Role.js";
import { RolePermission } from "./RolePermission.js";
import { User } from "./User.js";

export { Business, Customer, Invoice, InvoiceLineItem, Product, Role, RolePermission, User };
export type { ProductKind } from "./Product.js";

export const entities = [
  Business,
  Customer,
  Invoice,
  InvoiceLineItem,
  Product,
  Role,
  RolePermission,
  User,
];
