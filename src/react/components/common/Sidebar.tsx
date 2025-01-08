import { RxDashboard, RxGear } from "react-icons/rx";
import { NavLink } from "react-router";
import logo from "../../assets/branding/logo-no-background.png";
import { MdTimeline } from "react-icons/md";
import { BiReceipt } from "react-icons/bi";

function Sidebar() {
  const sidebarElements = [
    {
      title: "Dashboard",
      icon: RxDashboard,
      path: "/dashboard",
    },
    {
      title: "Invoice",
      icon: BiReceipt,
      path: "/invoice-create",
    },
    {
      title: "Sales",
      icon: MdTimeline,
      path: "/sales",
    },
    {
      title: "Settings",
      icon: RxGear,
      path: "/settings",
    },
  ];
  return (
    <div className="p-5 w-full">
      <div className="w-full flex justify-center">
        <img
          src={logo}
          className="min-w-[160px] max-w-[190px] my-4"
          alt="billsane-logo"
          loading="lazy"
        />
      </div>
      {sidebarElements.map((item, index) => (
        <NavLink
          key={index}
          to={item.path}
          className={({ isActive }) =>
            `p-2 flex items-center gap-4 text-lg transition-all duration-200 ${isActive ? "bg-prussian_blue text-white rounded-lg pl-6" : "text-black"}`
          }>
          <item.icon size={24} />
          {item.title}
        </NavLink>
      ))}
    </div>
  );
}

export default Sidebar;
