import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, Relation } from "typeorm";
import { Customer } from "./Customer.js";
import { InvoiceLineItem } from "./InvoiceLineItem.js";
import { decimalTransformer } from "../decimalTransformer.js";

@Entity()
export class Invoice {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  invoiceNo!: string;

  // Display-formatted date string (e.g. "22 Jul 2026"), matches the existing
  // SavedInvoice.date shape the print template already renders directly.
  @Column()
  date!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Customer, (customer) => customer.invoices, { eager: true })
  customer!: Relation<Customer>;

  @OneToMany(() => InvoiceLineItem, (lineItem) => lineItem.invoice, {
    cascade: true,
    eager: true,
  })
  lineItems!: Relation<InvoiceLineItem>[];

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true, transformer: decimalTransformer })
  totalAmount!: number | null;

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true, transformer: decimalTransformer })
  totalTax!: number | null;

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true, transformer: decimalTransformer })
  totalDiscount!: number | null;

  @Column()
  paymentType!: string;
}
