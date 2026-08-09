import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { FiAlertTriangle, FiRefreshCw } from "react-icons/fi";
import FallbackSpinner from "../components/ui/spinners/FallbackSpinner";
import Button from "../components/ui/elements/Button";
import EmptyState from "../components/ui/elements/EmptyState";
import {
  getAuthState,
  setupOwner,
  signIn as signInRequest,
  signOut as signOutRequest,
  type AuthSession,
  type AuthState,
  type Permission,
  type SetupInput,
  type SignInInput,
} from "../utils/authStore";
import { AuthContext, type AuthApi, type AuthStatus } from "./authContext";

/**
 * Boots the session before anything else renders.
 *
 * Nothing downstream has to handle "we don't know yet": the provider holds a
 * boot screen until the main process has answered, so `useAuth()` always
 * reports one of three settled states. That is what lets ProtectedRoute be a
 * plain redirect instead of a spinner that flashes the sign-in screen at
 * someone who is already signed in.
 */
function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getAuthState()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((err) => {
        // The database failed to open. Auth can't be decided either way, and
        // guessing "signed out" would hand someone a sign-in form that could
        // never succeed.
        if (!cancelled) {
          setBootError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  /** Re-ask who is signed in. Only ever called from an event handler. */
  const load = useCallback(async () => {
    setBootError(null);
    try {
      setState(await getAuthState());
    } catch (err) {
      setBootError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const api = useMemo<AuthApi | null>(() => {
    if (!state) return null;

    const session: AuthSession | null =
      state.status === "signed-in" ? state.session : null;
    const permissions: Permission[] = session?.permissions ?? [];

    return {
      status: state.status as AuthStatus,
      session,
      user: session?.user ?? null,
      permissions,
      can: (...wanted: Permission[]) =>
        wanted.some((permission) => permissions.includes(permission)),
      signIn: async (input: SignInInput) => {
        setState({ status: "signed-in", session: await signInRequest(input) });
      },
      completeSetup: async (input: SetupInput) => {
        setState({ status: "signed-in", session: await setupOwner(input) });
      },
      signOut: async () => {
        await signOutRequest();
        // Not "signed-out" outright: signing out of the only account on a fresh
        // install has to land back on setup, and the main process is the one
        // that knows whether any account exists.
        await load();
      },
      applySession: (next: AuthSession) => {
        setState({ status: "signed-in", session: next });
      },
      refresh: load,
    };
  }, [state, load]);

  if (bootError) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-canvas p-6">
        <div className="card w-full max-w-lg">
          <EmptyState
            icon={FiAlertTriangle}
            title="BillSane couldn't open its database"
            description={bootError}
            action={
              <Button
                icon={<FiRefreshCw size={15} />}
                onClick={() => {
                  setBootError(null);
                  setAttempt((prev) => prev + 1);
                }}>
                Try again
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  if (!api) return <FallbackSpinner label="Starting BillSane…" />;

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
