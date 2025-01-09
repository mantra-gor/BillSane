import { ReactNode } from "react";
import { Navigate } from "react-router";

interface ProtectedRouteProps {
  allowedRole: string;
  element: ReactNode;
}

function ProtectedRoute({ allowedRole, element }: ProtectedRouteProps) {
  const isUserLoggedIn = localStorage.getItem("isUserLoggedIn") === "true";

  if (!isUserLoggedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  // Uncomment the following lines if role-based access is required:
  // else if (!allowedRole.includes(user.accountType)) {
  //   return <Navigate to="/" replace />;
  // }

  return <>{element}</>;
}

export default ProtectedRoute;
