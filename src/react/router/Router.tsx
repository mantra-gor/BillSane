import { Navigate, useRoutes } from "react-router";

//* Pages
import BlankLayout from "../components/core/layout/BlankLayout";
import Home from "../pages/Home";
import InvoiceCreate from "../pages/InvoiceCreate";
import Invoice from "../../invoice-templates/Invoice";
import Dashboard from "../pages/Dashboard";
import Sales from "../pages/Sales";
import Settings from "../pages/Settings";
import Account from "../pages/Settings/Account";
import Appearance from "../pages/Settings/Appearance";
import Configurations from "../pages/Settings/Configurations";
import Database from "../pages/Settings/Database";
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
              index: true,
              element: <Navigate to="/dashboard" />,
            },
            {
              path: "dashboard",
              element: <Dashboard />,
              index: true,
            },
            {
              path: "invoice-create",
              element: <InvoiceCreate />,
            },
            {
              path: "invoice/view",
              element: <Invoice />,
            },
            {
              path: "invoice/view/:id",
              element: <Invoice />,
            },
            {
              path: "sales",
              element: <Sales />,
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
                  path: "accounts",
                  element: <Account />,
                },
                {
                  path: "appearance",
                  element: <Appearance />,
                },
                {
                  path: "config",
                  element: <Configurations />,
                },
                {
                  path: "database",
                  element: <Database />,
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
