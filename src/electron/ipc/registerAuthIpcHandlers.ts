import { DataSource } from "typeorm";
import { ipcHandle } from "../util.js";
import { ipcHandleGuarded } from "./guard.js";
import { getDataSource, whenDatabaseReady } from "../db/connectionManager.js";
import { getPermissionCatalog, type PermissionGroupInfo } from "../domain/permissions.js";
import {
  getAuthState,
  getSession,
  setupOwner,
  signIn,
  signOut,
} from "../domain/session.js";
import {
  changeOwnPassword,
  createUser,
  deleteUser,
  listUsers,
  setUserPassword,
  updateOwnProfile,
  updateUser,
} from "../domain/users.js";
import { createRole, deleteRole, listRoles, updateRole } from "../domain/roles.js";
import type { DbOperationResult } from "../db/types.js";
import type {
  AuthResult,
  AuthState,
  RoleSummary,
  UserSummary,
} from "../domain/types.js";

/**
 * Unlike the domain handlers, these wait for the database.
 *
 * Launch doesn't block on it (see main.ts), so the very first thing the
 * renderer asks — "am I signed in?" — can land before the file is open. Failing
 * that with "Database is not connected yet" would show a sign-in screen to
 * someone who is signed in.
 */
async function requireDataSource(): Promise<DataSource> {
  await whenDatabaseReady();
  const dataSource = getDataSource();
  if (!dataSource) {
    throw new Error("Database is not connected yet. Check Settings > Database.");
  }
  return dataSource;
}

function toErrorResult(err: unknown): DbOperationResult {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

function toAuthError(err: unknown): AuthResult {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

export function registerAuthIpcHandlers(): void {
  // --- Unauthenticated: the three things a signed-out window may ask --------

  ipcHandle("auth:state", async (): Promise<AuthState> => {
    return getAuthState(await requireDataSource());
  });

  ipcHandle("auth:setup", async (input): Promise<AuthResult> => {
    try {
      return await setupOwner(await requireDataSource(), input);
    } catch (err) {
      return toAuthError(err);
    }
  });

  ipcHandle("auth:signIn", async (input): Promise<AuthResult> => {
    try {
      return await signIn(await requireDataSource(), input);
    } catch (err) {
      return toAuthError(err);
    }
  });

  ipcHandle("auth:signOut", (): void => signOut());

  // --- The signed-in user's own account -------------------------------------
  // Not permission-gated: changing your own password and correcting your own
  // name are things every account can do, including one still holding the
  // temporary password an admin issued — that screen is the only way out of it.

  ipcHandle("auth:changePassword", async (input): Promise<DbOperationResult> => {
    try {
      await changeOwnPassword(await requireDataSource(), input);
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });

  ipcHandle("auth:updateProfile", async (input): Promise<AuthResult> => {
    try {
      await updateOwnProfile(await requireDataSource(), input);
      const session = getSession();
      if (!session) throw new Error("You are signed out. Sign in to continue.");
      return { ok: true, session };
    } catch (err) {
      return toAuthError(err);
    }
  });

  // --- User administration --------------------------------------------------

  ipcHandleGuarded("user:list", ["users:manage"], async (): Promise<UserSummary[]> => {
    return listUsers(await requireDataSource());
  });

  ipcHandleGuarded("user:create", ["users:manage"], async (input): Promise<DbOperationResult> => {
    try {
      await createUser(await requireDataSource(), input);
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });

  ipcHandleGuarded("user:update", ["users:manage"], async (input): Promise<DbOperationResult> => {
    try {
      await updateUser(await requireDataSource(), input);
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });

  ipcHandleGuarded("user:delete", ["users:manage"], async (id): Promise<DbOperationResult> => {
    try {
      await deleteUser(await requireDataSource(), id);
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });

  ipcHandleGuarded(
    "user:setPassword",
    ["users:manage"],
    async (input): Promise<DbOperationResult> => {
      try {
        await setUserPassword(await requireDataSource(), input);
        return { ok: true };
      } catch (err) {
        return toErrorResult(err);
      }
    }
  );

  // --- Roles ----------------------------------------------------------------
  // Reading roles is open to user managers too: the Add User dialog needs the
  // list to fill its dropdown, and being able to assign a role is not the same
  // as being able to rewrite one.

  ipcHandleGuarded(
    "role:list",
    ["roles:manage", "users:manage"],
    async (): Promise<RoleSummary[]> => {
      return listRoles(await requireDataSource());
    }
  );

  ipcHandleGuarded(
    "role:permissions",
    ["roles:manage"],
    (): PermissionGroupInfo[] => getPermissionCatalog()
  );

  ipcHandleGuarded("role:create", ["roles:manage"], async (input): Promise<DbOperationResult> => {
    try {
      await createRole(await requireDataSource(), input);
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });

  ipcHandleGuarded("role:update", ["roles:manage"], async (input): Promise<DbOperationResult> => {
    try {
      await updateRole(await requireDataSource(), input);
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });

  ipcHandleGuarded("role:delete", ["roles:manage"], async (id): Promise<DbOperationResult> => {
    try {
      await deleteRole(await requireDataSource(), id);
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  });
}
