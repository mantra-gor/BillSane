import { Navigate, useRoutes } from "react-router";

//* Pages
import BlankLayout from "../components/core/layout/BlankLayout";
import Home from "../pages/Home";
import InvoiceCreate from "../pages/InvoiceCreate";
import Invoice from "../../invoice-templates/Invoice";
import Dashboard from "../pages/Dashboard";
import Sales from "../pages/Sales";
import Customers from "../pages/Customers";
import Inventory from "../pages/Inventory";
import Settings from "../pages/Settings";
import Account from "../pages/Settings/Account";
import Appearance from "../pages/Settings/Appearance";
import Configurations from "../pages/Settings/Configurations";
import Database from "../pages/Settings/Database";
import Roles from "../pages/Settings/Roles";
import Users from "../pages/Settings/Users";
import AuthRoute from "./AuthRoute";
import ProtectedRoute from "./ProtectedRoute";
import { useAuth } from "../auth/authContext";
import { landingPath } from "./navigation";

/** "/" is wherever this user's first reachable screen is — see landingPath. */
function Landing() {
  const { can } = useAuth();
  return <Navigate to={landingPath(can)} replace />;
}

const Router = () => {
  const routes = useRoutes([
    {
      path: "/",
      element: <BlankLayout />,
      children: [
        {
          path: "/sign-in",
          element: <AuthRoute screen="signin" />,
        },
        {
          // First run only: creating the first account, on an empty database.
          // There is no sign-up — after this exists, an administrator adds
          // everyone else from Settings → Users.
          path: "/setup",
          element: <AuthRoute screen="setup" />,
        },
        {
          path: "/",
          element: <ProtectedRoute element={<Home />} />,
          children: [
            {
              index: true,
              element: <Landing />,
            },
            {
              path: "dashboard",
              element: (
                <ProtectedRoute permission={["dashboard:view"]} element={<Dashboard />} />
              ),
              index: true,
            },
            {
              path: "invoice-create",
              element: (
                <ProtectedRoute permission={["invoice:create"]} element={<InvoiceCreate />} />
              ),
            },
            {
              // Reached straight after a sale with the invoice in router state,
              // which is why creating one is enough to open it.
              path: "invoice/view",
              element: (
                <ProtectedRoute
                  permission={["invoice:view", "invoice:create"]}
                  element={<Invoice />}
                />
              ),
            },
            {
              path: "invoice/view/:id",
              element: (
                <ProtectedRoute
                  permission={["invoice:view", "invoice:create"]}
                  element={<Invoice />}
                />
              ),
            },
            {
              path: "sales",
              element: <ProtectedRoute permission={["invoice:view"]} element={<Sales />} />,
            },
            {
              path: "customers",
              element: (
                <ProtectedRoute permission={["customer:view"]} element={<Customers />} />
              ),
            },
            {
              path: "inventory",
              element: (
                <ProtectedRoute permission={["inventory:view"]} element={<Inventory />} />
              ),
            },
            {
              path: "settings",
              element: <Settings />,
              children: [
                {
                  index: true,
                  element: <Navigate to="/settings/accounts" />,
                },
                {
                  // Always reachable: every account can edit its own profile
                  // and change its own password.
                  path: "accounts",
                  element: <Account />,
                },
                {
                  path: "appearance",
                  element: <Appearance />,
                },
                {
                  path: "config",
                  element: (
                    <ProtectedRoute
                      permission={["settings:business"]}
                      element={<Configurations />}
                    />
                  ),
                },
                {
                  path: "users",
                  element: <ProtectedRoute permission={["users:manage"]} element={<Users />} />,
                },
                {
                  path: "roles",
                  element: <ProtectedRoute permission={["roles:manage"]} element={<Roles />} />,
                },
                {
                  path: "database",
                  element: (
                    <ProtectedRoute permission={["settings:database"]} element={<Database />} />
                  ),
                },
              ],
            },
          ],
        },
        {
          path: "*",
          element: <>Not Found</>,
        },
      ],
    },
  ]);

  return routes;
};

export default Router;
