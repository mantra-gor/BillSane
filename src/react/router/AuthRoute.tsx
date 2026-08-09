import { Navigate } from "react-router";
import AuthLayout from "../components/core/layout/AuthLayout";
import { useAuth } from "../auth/authContext";
import { landingPath } from "./navigation";

/**
 * The other side of ProtectedRoute: keeps the signed-out screens honest.
 *
 * There is exactly one right screen for each state, and it isn't the one in the
 * URL bar — a fresh install has no account to sign in to, an installed one has
 * nothing to set up, and someone already signed in has no business on either.
 */
function AuthRoute({ screen }: { screen: "signin" | "setup" }) {
  const { status, can } = useAuth();

  if (status === "signed-in") return <Navigate to={landingPath(can)} replace />;
  if (status === "setup" && screen !== "setup") return <Navigate to="/setup" replace />;
  if (status === "signed-out" && screen === "setup") {
    return <Navigate to="/sign-in" replace />;
  }

  return <AuthLayout formType={screen} />;
}

export default AuthRoute;
