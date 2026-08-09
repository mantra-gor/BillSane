import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn, Relation } from "typeorm";
import { RolePermission } from "./RolePermission.js";
import { User } from "./User.js";

@Entity()
export class Role {
  @PrimaryGeneratedColumn()
  id!: number;

  // As typed, casing preserved - this is what the Users table and the sidebar
  // show.
  @Column()
  name!: string;

  // The natural key, folded by normalizeName() the same way Product.nameKey is.
  // Stops "Cashier" and "cashier" from becoming two roles nobody can tell apart
  // in a dropdown.
  @Index({ unique: true })
  @Column()
  nameKey!: string;

  @Column({ type: "varchar", nullable: true })
  description!: string | null;

  // The one role BillSane ships with. It is locked: it can't be renamed,
  // deleted, or have its permissions edited, and it always resolves to the full
  // catalog - so a permission added in a future version reaches the owner
  // without a migration. Every other role, including the seeded ones, is
  // ordinary data the owner can rewrite.
  @Column({ default: false })
  isSystem!: boolean;

  @OneToMany(() => RolePermission, (grant) => grant.role, {
    cascade: true,
    eager: true,
  })
  permissions!: Relation<RolePermission>[];

  @OneToMany(() => User, (user) => user.role)
  users!: Relation<User>[];
}
