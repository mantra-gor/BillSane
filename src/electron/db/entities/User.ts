import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";
import { Role } from "./Role.js";

// Explicitly "app_user": the default table name would be "user", which is a
// reserved word in postgres — and hybrid mode runs this schema there too.
@Entity("app_user")
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  // The sign-in identifier. Stored folded to lowercase and matched exactly, the
  // same trick normalizeEmail() plays for customers - unique here, because two
  // people answering to one login is not a thing an audit trail can survive.
  @Index({ unique: true })
  @Column()
  email!: string;

  @Column({ type: "varchar", nullable: true })
  phone!: string | null;

  // A data URL, kept on the row rather than in a file beside it (the way the
  // business logo is). The business has exactly one logo and every screen needs
  // it; avatars are per-user and the record has to travel intact once hybrid
  // sync lands, so self-contained wins over a second file to keep in step.
  @Column({ type: "text", nullable: true })
  avatar!: string | null;

  // scrypt output, parameters included - see domain/password.ts. Never crosses
  // the bridge: no IPC payload carries this column.
  @Column()
  passwordHash!: string;

  @Column()
  roleId!: number;

  // Eager, and Role loads its permissions eagerly in turn, so reading a user is
  // enough to answer "what may they do" without a second round trip on every
  // guarded IPC call.
  @ManyToOne(() => Role, (role) => role.users, { eager: true })
  @JoinColumn({ name: "roleId" })
  role!: Relation<Role>;

  // Suspending beats deleting for someone who has left: their invoices keep a
  // name against them, and the login stops working the same minute.
  @Column({ default: true })
  isActive!: boolean;

  // Set when an admin hands out a temporary password. The next sign-in lands on
  // the change-password screen and goes nowhere else until it is replaced.
  @Column({ default: false })
  mustChangePassword!: boolean;

  @Column({ type: "datetime", nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
