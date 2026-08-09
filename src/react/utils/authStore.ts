// Thin renderer wrapper over the main-process auth/RBAC service. Types are
// derived from the preload bridge (types.d.ts) so the DTO shapes stay defined in
// exactly one place — the electron domain layer.
//
// Nothing here decides anything. Every call crosses to the main process, which
// holds the session and enforces the permission; these functions only unwrap
// result objects into values and thrown errors, the way productStore does.

export type AuthState = Awaited<ReturnType<Window["electron"]["getAuthState"]>>;
export type AuthSession = Extract<AuthState, { status: "signed-in" }>["session"];
export type AuthUser = AuthSession["user"];
export type Permission = AuthSession["permissions"][number];

export type UserSummary = Awaited<ReturnType<Window["electron"]["listUsers"]>>[number];
export type UserCreateInput = Parameters<Window["electron"]["createUser"]>[0];
export type UserUpdateInput = Parameters<Window["electron"]["updateUser"]>[0];
export type UserPasswordInput = Parameters<Window["electron"]["setUserPassword"]>[0];

export type RoleSummary = Awaited<ReturnType<Window["electron"]["listRoles"]>>[number];
export type RoleInput = Parameters<Window["electron"]["createRole"]>[0];
export type RoleUpdateInput = Parameters<Window["electron"]["updateRole"]>[0];
export type PermissionGroup = Awaited<
  ReturnType<Window["electron"]["listPermissions"]>
>[number];

export type SetupInput = Parameters<Window["electron"]["setupOwner"]>[0];
export type SignInInput = Parameters<Window["electron"]["signIn"]>[0];
export type ChangePasswordInput = Parameters<Window["electron"]["changePassword"]>[0];
export type ProfileUpdateInput = Parameters<Window["electron"]["updateProfile"]>[0];

/** Mirrors domain/password.ts — the one rule, stated once on each side. */
export const PASSWORD_MIN_LENGTH = 8;

export const passwordValidation = {
  required: "Password is required",
  minLength: {
    value: PASSWORD_MIN_LENGTH,
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
  },
};

export function getAuthState(): Promise<AuthState> {
  return window.electron.getAuthState();
}

export async function signIn(input: SignInInput): Promise<AuthSession> {
  const result = await window.electron.signIn(input);
  if (!result.ok) throw new Error(result.error);
  return result.session;
}

export async function setupOwner(input: SetupInput): Promise<AuthSession> {
  const result = await window.electron.setupOwner(input);
  if (!result.ok) throw new Error(result.error);
  return result.session;
}

export function signOut(): Promise<void> {
  return window.electron.signOut();
}

export async function changePassword(input: ChangePasswordInput): Promise<void> {
  const result = await window.electron.changePassword(input);
  if (!result.ok) throw new Error(result.error);
}

export async function updateProfile(input: ProfileUpdateInput): Promise<AuthSession> {
  const result = await window.electron.updateProfile(input);
  if (!result.ok) throw new Error(result.error);
  return result.session;
}

// --- User administration ----------------------------------------------------

export function listUsers(): Promise<UserSummary[]> {
  return window.electron.listUsers();
}

export async function createUser(input: UserCreateInput): Promise<void> {
  const result = await window.electron.createUser(input);
  if (!result.ok) throw new Error(result.error);
}

export async function updateUser(input: UserUpdateInput): Promise<void> {
  const result = await window.electron.updateUser(input);
  if (!result.ok) throw new Error(result.error);
}

export async function deleteUser(id: number): Promise<void> {
  const result = await window.electron.deleteUser(id);
  if (!result.ok) throw new Error(result.error);
}

export async function setUserPassword(input: UserPasswordInput): Promise<void> {
  const result = await window.electron.setUserPassword(input);
  if (!result.ok) throw new Error(result.error);
}

// --- Roles ------------------------------------------------------------------

export function listRoles(): Promise<RoleSummary[]> {
  return window.electron.listRoles();
}

export function listPermissions(): Promise<PermissionGroup[]> {
  return window.electron.listPermissions();
}

export async function createRole(input: RoleInput): Promise<void> {
  const result = await window.electron.createRole(input);
  if (!result.ok) throw new Error(result.error);
}

export async function updateRole(input: RoleUpdateInput): Promise<void> {
  const result = await window.electron.updateRole(input);
  if (!result.ok) throw new Error(result.error);
}

export async function deleteRole(id: number): Promise<void> {
  const result = await window.electron.deleteRole(id);
  if (!result.ok) throw new Error(result.error);
}

// --- Display helpers --------------------------------------------------------

/** "Two initials" avatar fallback, shared by the sidebar and the Users table. */
export function initialsFor(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** "Today, 14:32" / "12 Aug 2026" / "Never" — the last-seen column. */
export function formatLastLogin(iso: string | null): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Never";

  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) {
    return `Today, ${date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
