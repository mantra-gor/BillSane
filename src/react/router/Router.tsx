import { useRoutes } from "react-router";

//* Pages
import BlankLayout from "../components/core/layout/BlankLayout";
import Home from "../pages/Home";
import InvoiceCreate from "../pages/InvoiceCreate";
import Invoice from "../../invoice-templates/Invoice";
import Dashboard from "../pages/Dashboard";
import Settings from "../pages/Settings";
import Account from "../pages/Settings/Account";
import Security from "../pages/Settings/Security";
import Appearance from "../pages/Settings/Appearance";
import Configurations from "../pages/Settings/Configurations";
import AuthLayout from "../components/core/layout/AuthLayout";
import ProtectedRoute from "./ProtectedRoute";

const Router = () => {
  const routes = useRoutes([
    {
      path: "/",
      element: <BlankLayout />,
      children: [
        {
          path: "/sign-in",
          element: <AuthLayout formType="signin" />,
        },
        {
          path: "/sign-up",
          element: <AuthLayout formType="signup" />,
        },
        {
          path: "/",
          element: <ProtectedRoute allowedRole="Admin" element={<Home />} />,
          children: [
            {
              path: "/dashboard",
              element: <Dashboard />,
              index: true,
            },
            {
              path: "invoice-create",
              element: <InvoiceCreate />,
            },
            {
              path: "sales",
              element: <Invoice />,
            },
            {
              path: "settings",
              element: <Settings />,
              children: [
                {
                  path: "accounts",
                  element: <Account />,
                },
                {
                  path: "security",
                  element: <Security />,
                },
                {
                  path: "appearance",
                  element: <Appearance />,
                },
                {
                  path: "config",
                  element: <Configurations />,
                },
              ],
            },
          ],
        },
      ],
    },
  ]);

  return routes;
};

export default Router;
