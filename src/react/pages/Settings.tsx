import { NavLink, Outlet } from "react-router";

function Settings() {
  const settingsOptions = [
    { title: "Account", path: "accounts" },
    { title: "Security", path: "security" },
    { title: "Appearance", path: "appearance" },
    { title: "Configurations", path: "config" },
  ];

  return (
    <div className="w-full h-full p-6 rounded-2xl bg-white border shadow-xl">
      <h1 className="text-xl py-1 px-4 font-semibold">Settings</h1>
      <div className="px-4 mt-3">
        <div className="px-2 py-2 bg-primary-25 rounded-xl flex gap-8">
          {settingsOptions.map((item, index) => (
            <NavLink
              key={index}
              to={item.path}
              className={({ isActive }) =>
                `font-semibold px-4 py-1 rounded-lg duration-200
              ${isActive ? "bg-munsell_blue text-white " : "inactive-class"}`
              }>
              {item.title}
            </NavLink>
          ))}
        </div>
        <div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default Settings;
