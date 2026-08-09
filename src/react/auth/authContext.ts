import { createContext, useContext } from "react";
import type {
  AuthSession,
  AuthUser,
  Permission,
  SetupInput,
  SignInInput,
} from "../utils/authStore";

/**
 * Split from the provider for the reason toastContext is: a file that exports
 * both a component and a hook trips react-refresh, and this hook is imported by
 * nearly every screen.
 */

/** "loading" never reaches consumers — the provider holds the boot screen. */
export type AuthStatus = "setup" | "signed-out" | "signed-in";

export interface AuthApi {
  status: AuthStatus;
  session: AuthSession | null;
  user: AuthUser | null;
  permissions: Permission[];
  /**
   * True when the user holds *any* of the listed permissions — the same
   * any-of rule the main process guards use, so a screen and the handler behind
   * it can never disagree about who gets in.
   *
   * This decides what is *shown*. What is *allowed* is decided in the main
   * process, every time, regardless of what the renderer drew.
   */
  can: (...permissions: Permission[]) => boolean;
  signIn: (input: SignInInput) => Promise<void>;
  completeSetup: (input: SetupInput) => Promise<void>;
  signOut: () => Promise<void>;
  /** Adopts a session the main process just returned (profile save, password change). */
  applySession: (session: AuthSession) => void;
  /** Re-asks the main process who is signed in and what they may do. */
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthApi | null>(null);

export function useAuth(): AuthApi {
  const api = useContext(AuthContext);
  if (!api) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return api;
}
