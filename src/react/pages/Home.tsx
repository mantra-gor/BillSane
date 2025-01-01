import { Outlet } from "react-router";
import Sidebar from "../components/common/Sidebar";
import AppLayout from "../components/core/layout/AppLayout";

function Home() {
  return (
    <div className="grid grid-cols-5 w-full min-h-screen bg-primary-5">
      <div
        className="flex justify-center w-[30%] max-w-[300px] min-w-[250px] 
        h-full fixed top-0 left-0 z-10">
        <Sidebar />
      </div>
      <div className="col-span-5 p-4 flex ml-[300px]">
        <AppLayout>
          <Outlet />
        </AppLayout>
      </div>
    </div>
  );
}

export default Home;
