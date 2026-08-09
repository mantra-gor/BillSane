import { DataSource, EntityManager, Not } from "typeorm";
import { Role, RolePermission, User } from "../db/entities/index.js";
import { displayName, normalizeName } from "./products.js";
import { sanitizePermissions } from "./permissions.js";
import { permissionsForRole, refreshCurrentSession } from "./session.js";
import { assertAdminRemains } from "./users.js";
import type { RoleInput, RoleSummary, RoleUpdateInput } from "./types.js";

/**
 * Custom roles.
 *
 * Every role in the app is data the owner can rewrite — including the three the
 * migration seeds — with exactly one exception: the system role, which is
 * locked and always resolves to the entire permission catalog. Something has to
 * still work after the owner has finished experimenting.
 *
 * Names are folded by the same `normalizeName` the product catalog uses, so
 * "Cashier" and "cashier " can't become two rows nobody can tell apart in a
 * dropdown.
 */

// pg returns COUNT() as a string; better-sqlite3 as a number.
function num(value: unknown): number {
  const parsed = value == null ? 0 : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function listRoles(dataSource: DataSource): Promise<RoleSummary[]> {
  const roles = await dataSource.getRepository(Role).find({ order: { name: "ASC" } });

  const counts = await dataSource
    .getRepository(User)
    .createQueryBuilder("user")
    .select("user.roleId", "roleId")
    .addSelect("COUNT(user.id)", "userCount")
    .groupBy("user.roleId")
    .getRawMany<{ roleId: unknown; userCount: unknown }>();

  const countByRole = new Map(counts.map((row) => [num(row.roleId), num(row.userCount)]));

  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: permissionsForRole(role),
    userCount: countByRole.get(role.id) ?? 0,
  }));
}

async function assertNameFree(
  dataSource: DataSource,
  nameKey: string,
  exceptRoleId?: number
): Promise<void> {
  const clash = await dataSource.getRepository(Role).findOne({
    where: exceptRoleId ? { nameKey, id: Not(exceptRoleId) } : { nameKey },
  });
  if (clash) {
    throw new Error(`There is already a role called ${clash.name}.`);
  }
}

function requireRoleName(name: string): { name: string; nameKey: string } {
  const display = displayName(name);
  if (!display) throw new Error("Role name is required.");
  return { name: display, nameKey: normalizeName(name) };
}

/**
 * Grants are rewritten wholesale rather than diffed: the set is a dozen rows at
 * most, and "delete then insert what was asked for" has no partial state to get
 * wrong. The transaction is what makes that safe.
 */
async function writeGrants(
  manager: EntityManager,
  roleId: number,
  permissions: readonly string[]
): Promise<void> {
  const repo = manager.getRepository(RolePermission);
  await repo.delete({ roleId });
  const wanted = sanitizePermissions(permissions);
  if (wanted.length === 0) return;
  await repo.insert(wanted.map((permission) => ({ roleId, permission })));
}

export async function createRole(dataSource: DataSource, input: RoleInput): Promise<void> {
  const { name, nameKey } = requireRoleName(input.name);
  await assertNameFree(dataSource, nameKey);

  await dataSource.transaction(async (manager) => {
    const saved = await manager.getRepository(Role).save(
      manager.getRepository(Role).create({
        name,
        nameKey,
        description: input.description?.trim() || null,
        isSystem: false,
      })
    );
    await writeGrants(manager, saved.id, input.permissions);
  });
}

export async function updateRole(
  dataSource: DataSource,
  input: RoleUpdateInput
): Promise<void> {
  const role = await dataSource.getRepository(Role).findOne({ where: { id: input.id } });
  if (!role) throw new Error("That role no longer exists.");
  if (role.isSystem) {
    throw new Error(
      `${role.name} is built in and always has every permission. Create a role to grant a narrower set.`
    );
  }

  const { name, nameKey } = requireRoleName(input.name);
  await assertNameFree(dataSource, nameKey, role.id);

  // Taking "Manage users" off the only role that has it is the same lockout as
  // deleting the last administrator, just spelled differently.
  await assertAdminRemains(dataSource, {
    role: { id: role.id, permissions: sanitizePermissions(input.permissions) },
  });

  await dataSource.transaction(async (manager) => {
    role.name = name;
    role.nameKey = nameKey;
    role.description = input.description?.trim() || null;
    await manager.getRepository(Role).save(role);
    await writeGrants(manager, role.id, input.permissions);
  });

  // Whoever is signed in may hold the role that just changed shape.
  await refreshCurrentSession(dataSource);
}

export async function deleteRole(dataSource: DataSource, id: number): Promise<void> {
  const role = await dataSource.getRepository(Role).findOne({ where: { id } });
  if (!role) return;
  if (role.isSystem) {
    throw new Error(`${role.name} is built in and can't be deleted.`);
  }

  // The FK is ON DELETE RESTRICT, so the driver would answer with an opaque
  // constraint error. Say it in the owner's terms instead: move these people
  // first.
  const holders = await dataSource.getRepository(User).count({ where: { roleId: id } });
  if (holders > 0) {
    throw new Error(
      `${holders} ${holders === 1 ? "person holds" : "people hold"} the ${role.name} role. Move ${
        holders === 1 ? "them" : "them all"
      } to another role first.`
    );
  }

  await assertAdminRemains(dataSource, { role: { id, removed: true } });
  await dataSource.getRepository(Role).delete(id);
}
