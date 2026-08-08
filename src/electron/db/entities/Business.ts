import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

// Single-row table (id is always 1) - enforced at the IPC layer, not the schema,
// since a hard DB-level constraint for "exactly one row" isn't portable across
// sqlite/postgres/mysql without dialect-specific tricks.
@Entity()
export class Business {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ default: "" })
  companyName!: string;

  @Column({ default: "" })
  phone!: string;

  @Column({ default: "" })
  email!: string;

  @Column({ default: "" })
  gstNo!: string;

  @Column({ default: "" })
  address!: string;

  // Logo is intentionally not a column - see registerDomainIpcHandlers.ts.
  // A 1MB base64 data URL would blow past MySQL's 64KB plain-TEXT limit, so
  // it's written to a file under userData instead.
}
