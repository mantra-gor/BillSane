import { Entity, JoinColumn, ManyToOne, PrimaryColumn, Relation } from "typeorm";
import { Role } from "./Role.js";

/**
 * One permission granted to one role.
 *
 * A row per grant rather than a comma-joined string column: the composite
 * primary key makes a duplicate grant impossible at the database level, and
 * "which roles can delete invoices?" stays a query instead of a LIKE over text.
 *
 * `permission` is a plain varchar, not an enum - the catalog lives in
 * domain/permissions.ts and is validated on write. A key retired from the code
 * then reads as a stale row rather than a schema mismatch, which is the failure
 * mode that can be cleaned up instead of the one that blocks startup.
 */
@Entity()
export class RolePermission {
  @PrimaryColumn()
  roleId!: number;

  @PrimaryColumn()
  permission!: string;

  @ManyToOne(() => Role, (role) => role.permissions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "roleId" })
  role!: Relation<Role>;
}
