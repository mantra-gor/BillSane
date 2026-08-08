import { NavLink, Outlet } from "react-router";
import AppLayout from "../components/core/layout/AppLayout";
import PageHeader from "../components/ui/elements/PageHeader";
import { SETTINGS_TABS } from "../router/navigation";

/**
 * Settings frame. A vertical rail beats the old pill row: the tab labels stay
 * readable, each carries a description, and adding a tab doesn't squeeze the
 * others.
 */
function Settings() {
  return (
    <AppLayout className="space-y-5">
      <PageHeader
        title="Settings"
        description="Configure your profile, business details and where data is stored."
      />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <nav className="w-full shrink-0 lg:sticky lg:top-6 lg:w-64">
          <ul className="card space-y-1 p-2">
            {SETTINGS_TABS.map((tab) => (
              <li key={tab.path}>
                <NavLink
                  to={tab.path}
                  className={({ isActive }) =>
                    `flex items-start gap-3 rounded-xl px-3 py-2.5 transition-all duration-150 ease-snap ${
                      isActive
                        ? "bg-prussian_blue text-white shadow-brand"
                        : "text-ink-soft hover:bg-surface-muted"
                    }`
                  }>
                  {({ isActive }) => (
                    <>
                      <tab.icon
                        size={17}
                        className={`mt-0.5 shrink-0 ${
                          isActive ? "text-munsell_blue-400" : "text-ink-faint"
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">
                          {tab.title}
                        </span>
                        <span
                          className={`mt-0.5 block text-xs leading-snug ${
                            isActive ? "text-white/60" : "text-ink-faint"
                          }`}>
                          {tab.description}
                        </span>
                      </span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </AppLayout>
  );
}

export default Settings;
