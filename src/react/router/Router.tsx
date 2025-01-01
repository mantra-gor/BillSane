import { useRoutes } from "react-router";
import BlankLayout from "../components/core/layout/BlankLayout";
import Home from "../pages/Home";
import InvoiceCreate from "../pages/InvoiceCreate";
import Invoice from "../../invoice-templates/Invoice";
import Dashboard from "../pages/Dashboard";

const Router = () => {
  const routes = useRoutes([
    {
      path: "/",
      element: <BlankLayout />,
      children: [
        {
          path: "/",
          element: <Home />,
          children: [
            {
              index: true,
              element: <InvoiceCreate />,
            },
            {
              path: "invoice-create",
              element: <InvoiceCreate />,
            },
            {
              path: "dashboard",
              element: <Dashboard />,
            },
            {
              path: "sales",
              element: <Invoice />,
            },
          ],
        },
      ],
    },
  ]);

  return routes;
};

export default Router;
