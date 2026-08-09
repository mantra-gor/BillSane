import { DataSource, Not } from "typeorm";
import { Role, User } from "../db/entities/index.js";
import { normalizeEmail } from "./customers.js";
import { assertPasswordAcceptable, hashPassword, verifyPassword } from "./password.js";
import type { Permission } from "./permissions.js";
import {
  getSession,
  permissionsForRole,
  refreshCurrentSession,
  requireSession,
} from "./session.js";
import type {
  ChangePasswordInput,
  ProfileUpdateInput,
  UserCreateInput,
  UserPasswordInput,
  UserSummary,
} from "./types.js";

// A "last administrator" is really "the last active account that can manage
// users" — the permission, not a role name, because roles here are custom and
// the owner may well have deleted the one called Administrator.
const KEYSTONE: Permission = "users:manage";

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toSummary(user: User, currentUserId: number | undefined): UserSummary {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    roleId: user.roleId,
    roleName: user.role.name,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: toIso(user.lastLoginAt),
    createdAt: toIso(user.createdAt) ?? new Date().toISOString(),
    isCurrent: user.id === currentUserId,
  };
}

export async function listUsers(dataSource: DataSource): Promise<UserSummary[]> {
  const users = await dataSource.getRepository(User).find({ order: { name: "ASC" } });
  const currentUserId = getSession()?.user.id;
  return users.map((user) => toSummary(user, currentUserId));
}

// --- The lockout guard ------------------------------------------------------

/**
 * A change to a user or a role, described before it is written.
 *
 * Every path that could remove the last person able to administer the app runs
 * through here first: suspending them, deleting them, moving them to a weaker
 * role, or quietly taking `users:manage` off the role they hold. Losing that
 * means nobody can ever add it back — the only exit is editing the database by
 * hand — so it is worth one extra read to refuse.
 */
export interface AccessChange {
  user?: { id: number; roleId?: number; isActive?: boolean; removed?: boolean };
  role?: { id: number; permissions?: Permission[]; removed?: boolean };
}

export async function assertAdminRemains(
  dataSource: DataSource,
  change: AccessChange
): Promise<void> {
  const users = await dataSource.getRepository(User).find();

  const rolesById = new Map<number, Role>();
  for (const user of users) rolesById.set(user.roleId, user.role);

  // A user being moved to a role nobody holds yet isn't in the map above.
  const targetRoleId = change.user?.roleId;
  if (targetRoleId !== undefined && !rolesById.has(targetRoleId)) {
    const role = await dataSource.getRepository(Role).findOne({ where: { id: targetRoleId } });
    if (role) rolesById.set(role.id, role);
  }

  const grantsKeystone = (roleId: number): boolean => {
    if (change.role?.id === roleId) {
      if (change.role.removed) return false;
      if (change.role.permissions) return change.role.permissions.includes(KEYSTONE);
    }
    const role = rolesById.get(roleId);
    return role ? permissionsForRole(role).includes(KEYSTONE) : false;
  };

  const survivors = users.filter((user) => {
    const edit = change.user?.id === user.id ? change.user : undefined;
    if (edit?.removed) return false;
    if (!(edit?.isActive ?? user.isActive)) return false;
    return grantsKeystone(edit?.roleId ?? user.roleId);
  });

  if (survivors.length === 0) {
    throw new Error(
      "That would leave BillSane with nobody who can manage users. Give another active account a role with “Manage users” first."
    );
  }
}

// --- Administration ---------------------------------------------------------

async function assertEmailFree(
  dataSource: DataSource,
  email: string,
  exceptUserId?: number
): Promise<void> {
  const clash = await dataSource.getRepository(User).findOne({
    where: exceptUserId ? { email, id: Not(exceptUserId) } : { email },
  });
  if (clash) {
    throw new Error(`${email} already signs in to BillSane as ${clash.name}.`);
  }
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  return trimmed;
}

function requireEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error("Email is required.");
  return normalized;
}

async function requireRole(dataSource: DataSource, roleId: number): Promise<Role> {
  const role = await dataSource.getRepository(Role).findOne({ where: { id: roleId } });
  if (!role) throw new Error("That role no longer exists. Pick another one.");
  return role;
}

export async function createUser(
  dataSource: DataSource,
  input: UserCreateInput
): Promise<void> {
  const repo = dataSource.getRepository(User);
  const name = requireName(input.name);
  const email = requireEmail(input.email);
  await assertEmailFree(dataSource, email);
  await requireRole(dataSource, input.roleId);
  assertPasswordAcceptable(input.password);

  await repo.save(
    repo.create({
      name,
      email,
      phone: input.phone?.trim() || null,
      avatar: null,
      passwordHash: await hashPassword(input.password),
      roleId: input.roleId,
      isActive: true,
      mustChangePassword: input.mustChangePassword,
    })
  );
}

export async function updateUser(
  dataSource: DataSource,
  input: {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    roleId: number;
    isActive: boolean;
  }
): Promise<void> {
  const repo = dataSource.getRepository(User);
  const user = await repo.findOne({ where: { id: input.id } });
  if (!user) throw new Error("That user no longer exists.");

  const name = requireName(input.name);
  const email = requireEmail(input.email);
  await assertEmailFree(dataSource, email, user.id);
  const role = await requireRole(dataSource, input.roleId);

  // Suspending yourself locks you out of the app you are holding — always a
  // mistake, and worth naming rather than letting the lockout guard explain it
  // in terms of somebody else's account.
  if (!input.isActive && getSession()?.user.id === user.id) {
    throw new Error("You can't suspend the account you're signed in with.");
  }

  await assertAdminRemains(dataSource, {
    user: { id: user.id, roleId: input.roleId, isActive: input.isActive },
  });

  user.name = name;
  user.email = email;
  user.phone = input.phone?.trim() || null;
  // Both halves, deliberately. `role` is eagerly loaded, so the entity arrives
  // holding the *old* Role object — and on save TypeORM writes the FK from the
  // relation, quietly undoing a change made only to `roleId`. Setting the id
  // alone looks right and does nothing.
  user.roleId = role.id;
  user.role = role;
  user.isActive = input.isActive;
  await repo.save(user);

  await refreshCurrentSession(dataSource);
}

export async function deleteUser(dataSource: DataSource, id: number): Promise<void> {
  const repo = dataSource.getRepository(User);
  const user = await repo.findOne({ where: { id } });
  if (!user) return;

  if (getSession()?.user.id === id) {
    throw new Error("You can't delete the account you're signed in with.");
  }
  await assertAdminRemains(dataSource, { user: { id, removed: true } });

  await repo.delete(id);
}

/** An admin handing out a new password — no current password to prove. */
export async function setUserPassword(
  dataSource: DataSource,
  input: UserPasswordInput
): Promise<void> {
  const repo = dataSource.getRepository(User);
  const user = await repo.findOne({ where: { id: input.id } });
  if (!user) throw new Error("That user no longer exists.");
  assertPasswordAcceptable(input.password);

  user.passwordHash = await hashPassword(input.password);
  user.mustChangePassword = input.mustChangePassword;
  await repo.save(user);

  await refreshCurrentSession(dataSource);
}

// --- The signed-in user's own account ---------------------------------------

export async function changeOwnPassword(
  dataSource: DataSource,
  input: ChangePasswordInput
): Promise<void> {
  const session = requireSession();
  const repo = dataSource.getRepository(User);
  const user = await repo.findOne({ where: { id: session.user.id } });
  if (!user) throw new Error("Your account no longer exists.");

  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new Error("Your current password is incorrect.");
  }
  assertPasswordAcceptable(input.newPassword);
  if (await verifyPassword(input.newPassword, user.passwordHash)) {
    throw new Error("Your new password must be different from the current one.");
  }

  user.passwordHash = await hashPassword(input.newPassword);
  // Clearing this is the whole point of the forced-change screen: it is the
  // only way out of it.
  user.mustChangePassword = false;
  await repo.save(user);

  await refreshCurrentSession(dataSource);
}

export async function updateOwnProfile(
  dataSource: DataSource,
  input: ProfileUpdateInput
): Promise<void> {
  const session = requireSession();
  const repo = dataSource.getRepository(User);
  const user = await repo.findOne({ where: { id: session.user.id } });
  if (!user) throw new Error("Your account no longer exists.");

  const email = requireEmail(input.email);
  await assertEmailFree(dataSource, email, user.id);

  user.name = requireName(input.name);
  user.email = email;
  user.phone = input.phone?.trim() || null;
  user.avatar = input.avatar || null;
  await repo.save(user);

  await refreshCurrentSession(dataSource);
}
