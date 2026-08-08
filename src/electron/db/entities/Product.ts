import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn, Relation } from "typeorm";
import { InvoiceLineItem } from "./InvoiceLineItem.js";
import { decimalTransformer } from "../decimalTransformer.js";

// "product" is stocked; "service" is billed but never counted, so stock rules
// skip it entirely.
export type ProductKind = "product" | "service";

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id!: number;

  // As typed, casing preserved - this is what prints on the invoice.
  @Column()
  name!: string;

  // The natural key. A line typed at the counter is matched against this, so
  // "Blue Pen", "blue pen" and "Blue  Pen" all resolve to one catalog row
  // instead of accumulating three. Folded by normalizeName() in domain/products.
  @Index({ unique: true })
  @Column()
  nameKey!: string;

  // Item code. Unique so a code can never point at two things, nullable because
  // items auto-created from an invoice line don't have one yet.
  @Index({ unique: true })
  @Column({ type: "varchar", nullable: true })
  sku!: string | null;

  @Column({ type: "varchar", default: "product" })
  kind!: ProductKind;

  @Column({ type: "varchar", nullable: true })
  hsnCode!: string | null;

  @Column({ default: "pcs" })
  unit!: string;

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true, transformer: decimalTransformer })
  rate!: number | null;

  // Free-text label (e.g. "GST"), matching InvoiceLineItem.taxType.
  @Column({ type: "varchar", nullable: true })
  taxType!: string | null;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true, transformer: decimalTransformer })
  taxPer!: number | null;

  // null means "never counted" - the state an auto-created item starts in, and
  // the one the owner resolves later on the Inventory page. Deliberately not the
  // same as 0 ("counted, none left"): selling against an uncounted item leaves
  // it uncounted rather than driving it negative.
  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true, transformer: decimalTransformer })
  stockQty!: number | null;

  // Reorder point. null means the item never reports as low.
  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true, transformer: decimalTransformer })
  lowStockAt!: number | null;

  @OneToMany(() => InvoiceLineItem, (lineItem) => lineItem.product)
  lineItems!: Relation<InvoiceLineItem>[];
}
