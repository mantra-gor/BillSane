import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";
import { Invoice } from "./Invoice.js";
import { Product } from "./Product.js";
import { decimalTransformer } from "../decimalTransformer.js";

// Named InvoiceLineItem (not LineItem) to avoid colliding with the ambient
// global `LineItem` interface (types.d.ts) that the renderer's invoice-builder
// UI state already uses - these two are related but distinct shapes.
@Entity()
export class InvoiceLineItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Invoice, (invoice) => invoice.lineItems, { onDelete: "CASCADE" })
  invoice!: Relation<Invoice>;

  // Which catalog item was sold, when one is known - this is what stock is
  // deducted from. ON DELETE SET NULL, not RESTRICT (which is what the customer
  // FK uses): retiring a catalog entry must not be blocked by history, and the
  // invoice loses nothing because everything it prints is snapshotted below.
  //
  // The FK is also mapped as a plain column so reading an invoice back knows
  // what it sold without joining the whole catalog on every row.
  @Column({ type: "integer", nullable: true })
  productId!: number | null;

  @ManyToOne(() => Product, (product) => product.lineItems, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "productId" })
  product!: Relation<Product> | null;

  // The columns below are a snapshot taken at the moment of sale. Renaming or
  // repricing a product must never rewrite an invoice that has been issued.
  @Column({ type: "varchar", nullable: true })
  itemName!: string | null;

  // Free-text label (e.g. "GST"), not a numeric code - matches what
  // InvoiceCreate.tsx's "Tax Type" column actually collects today.
  @Column({ type: "varchar", nullable: true })
  taxType!: string | null;

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true, transformer: decimalTransformer })
  rate!: number | null;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true, transformer: decimalTransformer })
  taxPer!: number | null;

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true, transformer: decimalTransformer })
  qty!: number | null;

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true, transformer: decimalTransformer })
  tax!: number | null;

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true, transformer: decimalTransformer })
  subTotal!: number | null;
}
