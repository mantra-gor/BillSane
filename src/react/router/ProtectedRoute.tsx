import { ReactNode } from "react";
import { Navigate } from "react-router";
import { FiLock } from "react-icons/fi";
import AppLayout from "../components/core/layout/AppLayout";
import AuthLayout from "../components/core/layout/AuthLayout";
import EmptyState from "../components/ui/elements/EmptyState";
import { useAuth } from "../auth/authContext";
import type { Permission } from "../utils/authStore";

interface ProtectedRouteProps {
  /**
   * Any one of these is enough. Omitted means "any signed-in user" — which is
   * what the app shell itself needs, since the screens inside it do their own
   * gating.
   */
  permission?: Permission[];
  element: ReactNode;
}

/**
 * The renderer's half of access control: it decides what to *draw*.
 *
 * The main process decides what is *allowed* — every IPC handler re-checks the
 * same permission against the session it holds (see ipc/guard.ts). This
 * component exists so nobody is shown a screen that would only refuse them, not
 * because hiding a route protects anything on its own.
 */
function ProtectedRoute({ permission, element }: ProtectedRouteProps) {
  const { status, user, can } = useAuth();

  if (status === "setup") return <Navigate to="/setup" replace />;
  if (status !== "signed-in" || !user) return <Navigate to="/sign-in" replace />;

  // An admin handed this account a temporary password. Nothing else in the app
  // opens until it is replaced — one gate, covering every protected route.
  if (user.mustChangePassword) return <AuthLayout formType="password" />;

  if (permission && !can(...permission)) {
    return (
      <AppLayout>
        <div className="card">
          <EmptyState
            icon={FiLock}
            title="You don't have access to this screen"
            description={`Your ${user.roleName} role doesn't include this. If you need it, ask an administrator to adjust the role.`}
          />
        </div>
      </AppLayout>
    );
  }

  return <>{element}</>;
}

export default ProtectedRoute;
