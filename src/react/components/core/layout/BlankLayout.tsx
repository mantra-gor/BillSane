import { Outlet } from "react-router";

function BlankLayout() {
  return (
    <div className="w-screen min-h-screen">
      <Outlet />
    </div>
  );
}

export default BlankLayout;
