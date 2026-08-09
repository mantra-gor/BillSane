import fs from "fs";
import path from "path";
import { safeStorage } from "electron";
import { DataSource } from "typeorm";
import { Role, User } from "../db/entities/index.js";
import { getUserDataPath } from "../pathResolver.js";
import { ALL_PERMISSIONS, sanitizePermissions, type Permission } from "./permissions.js";
import { assertPasswordAcceptable, hashPassword, verifyPassword } from "./password.js";
import { normalizeEmail } from "./customers.js";
import type {
  AuthResult,
  AuthSession,
  AuthState,
  AuthUser,
  SetupInput,
  SignInInput,
} from "./types.js";

/**
 * The signed-in session, owned by the main process.
 *
 * This module is the whole point of the RBAC work. The renderer hides what a
 * user can't do, but hiding a button is decoration — the actual gate is that
 * every IPC handler asks *this* module what the current user may do, and the
 * renderer has no way to answer that question on its behalf. A tampered
 * renderer gets exactly the same "You don't have permission to…" as a mistyped
 * URL.
 */

const SESSION_FILE_NAME = "session.json";

// A counter machine that hasn't been touched in a month should ask again. Long
// enough not to nag a shop that opens daily, short enough to matter on a laptop
// that goes missing.
const MAX_SESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface StoredSession {
  userId: number;
  issuedAt: number;
}

let current: AuthSession | null = null;
let restorePromise: Promise<void> | null = null;

// --- Reading the session ----------------------------------------------------

export function getSession(): AuthSession | null {
  return current;
}

export function requireSession(): AuthSession {
  if (!current) {
    throw new Error("You are signed out. Sign in to continue.");
  }
  return current;
}

/**
 * The guard every protected handler runs.
 *
 * Several permissions means *any* of them is enough, which is what the shared
 * screens need: the invoice counter looks items up in the catalog, so a cashier
 * with `invoice:create` reaches the same search a manager reaches with
 * `inventory:view`, and neither needs the other's rights.
 */
export function requirePermission(...permissions: Permission[]): AuthSession {
  const session = requireSession();
  if (permissions.some((permission) => session.permissions.includes(permission))) {
    return session;
  }
  throw new Error("You don't have permission to do that.");
}

export function hasPermission(permission: Permission): boolean {
  return current?.permissions.includes(permission) ?? false;
}

// --- Mapping ----------------------------------------------------------------

/**
 * A system role holds the catalog itself rather than a stored list of grants.
 *
 * That is what stops the owner losing access to a feature that ships later: add
 * a permission to the catalog and the Administrator role already has it, with
 * no migration and no "why can't I see the new screen" support call.
 */
export function permissionsForRole(role: Role): Permission[] {
  if (role.isSystem) return [...ALL_PERMISSIONS];
  return sanitizePermissions((role.permissions ?? []).map((grant) => grant.permission));
}

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    roleId: user.roleId,
    roleName: user.role.name,
    isSystemRole: user.role.isSystem,
    mustChangePassword: user.mustChangePassword,
  };
}

function toSession(user: User): AuthSession {
  return { user: toAuthUser(user), permissions: permissionsForRole(user.role) };
}

// --- Persistence ------------------------------------------------------------
// "Keep me signed in" writes the user id through safeStorage, which ties
// decryption to the OS account. The file *is* the credential — there is no
// second secret to compare, because anything we could store beside it would be
// readable by whatever could read this. What safeStorage buys is that copying
// the file to another machine yields ciphertext nobody can open.

function getSessionPath(): string {
  return path.join(getUserDataPath(), SESSION_FILE_NAME);
}

function persistSession(userId: number): void {
  try {
    if (!safeStorage.isEncryptionAvailable()) return;
    const payload: StoredSession = { userId, issuedAt: Date.now() };
    const encrypted = safeStorage.encryptString(JSON.stringify(payload));
    fs.writeFileSync(getSessionPath(), encrypted.toString("base64"), { mode: 0o600 });
  } catch {
    // Staying signed in is a convenience. A keychain that refuses to play along
    // must not stop someone signing in — they just have to do it again next
    // launch.
  }
}

function clearPersistedSession(): void {
  try {
    fs.rmSync(getSessionPath(), { force: true });
  } catch {
    // Nothing actionable: the in-memory session is already gone, and a stale
    // file is re-validated against the database before it grants anything.
  }
}

function readPersistedSession(): StoredSession | null {
  try {
    const raw = fs.readFileSync(getSessionPath(), "utf-8");
    if (!safeStorage.isEncryptionAvailable()) return null;
    const decrypted = safeStorage.decryptString(Buffer.from(raw, "base64"));
    const parsed = JSON.parse(decrypted) as StoredSession;
    if (typeof parsed?.userId !== "number") return null;
    if (Date.now() - parsed.issuedAt > MAX_SESSION_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

// --- Lifecycle --------------------------------------------------------------

async function findUser(dataSource: DataSource, id: number): Promise<User | null> {
  return dataSource.getRepository(User).findOne({ where: { id } });
}

/**
 * Re-open a remembered session, once per launch.
 *
 * Role and status are re-read from the database rather than trusted from the
 * file, so a user suspended or re-scoped while the app was closed comes back
 * with the access they have *now*, not the access they had when they ticked the
 * box.
 */
export function ensureSessionRestored(dataSource: DataSource): Promise<void> {
  restorePromise ??= (async () => {
    const stored = readPersistedSession();
    if (!stored) return;

    const user = await findUser(dataSource, stored.userId).catch(() => null);
    if (!user || !user.isActive) {
      clearPersistedSession();
      return;
    }
    current = toSession(user);
  })();
  return restorePromise;
}

export async function getAuthState(dataSource: DataSource): Promise<AuthState> {
  await ensureSessionRestored(dataSource);
  if (current) return { status: "signed-in", session: current };

  const userCount = await dataSource.getRepository(User).count();
  return userCount === 0 ? { status: "setup" } : { status: "signed-out" };
}

export async function signIn(
  dataSource: DataSource,
  input: SignInInput
): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const user = email
    ? await dataSource.getRepository(User).findOne({ where: { email } })
    : null;

  // Whether the address exists is not worth leaking, so a missing user and a
  // wrong password answer identically. A *suspended* account is different: the
  // person already knows they had one, and "ask your admin" beats letting them
  // retype a password that was never the problem.
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    return { ok: false, error: "Email or password is incorrect." };
  }
  if (!user.isActive) {
    return {
      ok: false,
      error: "This account has been suspended. Ask an administrator to restore it.",
    };
  }

  user.lastLoginAt = new Date();
  await dataSource.getRepository(User).save(user);

  current = toSession(user);
  if (input.remember) {
    persistSession(user.id);
  } else {
    clearPersistedSession();
  }
  return { ok: true, session: current };
}

export function signOut(): void {
  current = null;
  clearPersistedSession();
}

/**
 * Create the first account, on an empty database.
 *
 * Guarded by the user count rather than by a permission — there is nobody to
 * hold one yet — which is also why the count is checked here and not only in
 * the renderer: this handler is reachable at any time, and after the first
 * account exists it must refuse.
 */
export async function setupOwner(
  dataSource: DataSource,
  input: SetupInput
): Promise<AuthResult> {
  const userRepo = dataSource.getRepository(User);
  if ((await userRepo.count()) > 0) {
    throw new Error("An account already exists. Sign in, or ask an administrator to add you.");
  }

  const email = normalizeEmail(input.email);
  if (!email) throw new Error("Email is required.");
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");
  assertPasswordAcceptable(input.password);

  // The locked, everything-included role the migration seeds. Looked up by its
  // folded name so a future rename of the seed doesn't strand this.
  const adminRole = await dataSource
    .getRepository(Role)
    .findOne({ where: { isSystem: true } });
  if (!adminRole) {
    throw new Error("The Administrator role is missing. Reinstall or restore from a backup.");
  }

  const saved = await userRepo.save(
    userRepo.create({
      name,
      email,
      phone: input.phone?.trim() || null,
      avatar: null,
      passwordHash: await hashPassword(input.password),
      roleId: adminRole.id,
      isActive: true,
      mustChangePassword: false,
    })
  );

  const user = await userRepo.findOneOrFail({ where: { id: saved.id } });
  current = toSession(user);
  persistSession(user.id);
  return { ok: true, session: current };
}

// --- Keeping the live session honest ----------------------------------------

/**
 * Re-read the signed-in user after anything that could change what they may do.
 *
 * Called by every user and role mutation. Without it, an owner who narrows a
 * role keeps their old permissions in memory until they sign out — and worse,
 * so does the person they just narrowed, on the machine they're already using.
 * A session whose user has been suspended or deleted ends here and now.
 */
export async function refreshCurrentSession(dataSource: DataSource): Promise<void> {
  if (!current) return;
  const user = await findUser(dataSource, current.user.id);
  if (!user || !user.isActive) {
    signOut();
    return;
  }
  current = toSession(user);
}
