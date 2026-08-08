import { Column, Entity, OneToMany, PrimaryGeneratedColumn, Relation } from "typeorm";
import { Invoice } from "./Invoice.js";

@Entity()
export class Customer {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  // Natural key - invoice:create upserts by phone rather than exposing a
  // separate customer-management surface (matches how the UI already only
  // ever captures customer details inline on an invoice).
  @Column({ unique: true })
  phone!: string;

  @Column({ type: "varchar", nullable: true })
  email!: string | null;

  @OneToMany(() => Invoice, (invoice) => invoice.customer)
  invoices!: Relation<Invoice>[];
}
