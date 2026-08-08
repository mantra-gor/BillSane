import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn, Relation } from "typeorm";
import { Invoice } from "./Invoice.js";

@Entity()
export class Customer {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  // Primary natural key - a phone number identifies one payer at the counter,
  // so invoice:create upserts on it when the till hasn't linked a record.
  @Column({ unique: true })
  phone!: string;

  // Secondary natural key. A returning customer who has changed their number is
  // still recognised by email, so lookups index it. Deliberately *not* unique:
  // households and small businesses legitimately share one address, and a
  // rejected save at the counter is worse than an ambiguous match the till can
  // ask about.
  @Index()
  @Column({ type: "varchar", nullable: true })
  email!: string | null;

  @OneToMany(() => Invoice, (invoice) => invoice.customer)
  invoices!: Relation<Invoice>[];
}
