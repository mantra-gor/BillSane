import { Outlet } from "react-router";

function BlankLayout() {
  return (
    <div className="w-screen max-h-screen">
      <Outlet />
    </div>
  );
}

export default BlankLayout;
