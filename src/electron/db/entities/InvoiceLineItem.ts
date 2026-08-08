import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, Relation } from "typeorm";
import { Invoice } from "./Invoice.js";
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
