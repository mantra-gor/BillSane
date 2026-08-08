import { NavLink, useNavigate } from "react-router";
import {
  FiChevronsLeft,
  FiChevronsRight,
  FiLogOut,
  FiUser,
} from "react-icons/fi";
import BrandMark from "./BrandMark";
import { NAV_GROUPS } from "../../router/navigation";
import { MOD_KEY } from "../../hooks/usePlatform";
import type { UserProfile } from "../../utils/userProfile";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  profile: UserProfile;
}

function Sidebar({ collapsed, onToggleCollapsed, profile }: SidebarProps) {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem("isUserLoggedIn");
    navigate("/sign-in");
  };

  const displayName = profile.fullName.trim() || "BillSane User";
  const initials =
    displayName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "B";

  return (
    <aside
      className={`flex h-full flex-col border-r border-shell-border bg-shell transition-[width] duration-200 ease-snap ${
        collapsed ? "w-[72px]" : "w-[248px]"
      }`}>
      {/* Brand */}
      <div
        className={`flex h-16 shrink-0 items-center border-b border-white/5 ${
          collapsed ? "justify-center px-3" : "px-5"
        }`}>
        <BrandMark
          size={26}
          discColor="#FFFFFF"
          starColor="#3AC3CF"
          textColor="#FFFFFF"
          glyphOnly={collapsed}
        />
      </div>

      {/* Navigation */}
      <nav className="scroll-area flex-1 px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            {!collapsed && (
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">
                {group.label}
              </p>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    title={
                      collapsed
                        ? `${item.title}${item.shortcut ? ` (${MOD_KEY}${item.shortcut})` : ""}`
                        : undefined
                    }
                    className={({ isActive }) =>
                      `group relative flex items-center rounded-xl text-sm font-medium
                       transition-all duration-150 ease-snap
                       ${collapsed ? "h-11 justify-center" : "h-11 gap-3 px-3"}
                       ${
                         isActive
                           ? "bg-munsell_blue/15 text-white"
                           : "text-white/60 hover:bg-white/[0.07] hover:text-white"
                       }`
                    }>
                    {({ isActive }) => (
                      <>
                        {/* Active rail — the persistent "you are here" marker. */}
                        <span
                          aria-hidden="true"
                          className={`absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-munsell_blue-400 transition-all duration-200 ease-snap ${
                            isActive ? "h-6 opacity-100" : "h-0 opacity-0"
                          }`}
                        />
                        <item.icon
                          size={19}
                          className={`shrink-0 transition-colors ${
                            isActive ? "text-munsell_blue-400" : ""
                          }`}
                        />
                        {!collapsed && (
                          <>
                            <span className="truncate">{item.title}</span>
                            {item.shortcut && (
                              <kbd className="kbd-dark ml-auto opacity-0 transition-opacity group-hover:opacity-100">
                                {MOD_KEY}
                                {item.shortcut}
                              </kbd>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* User + collapse */}
      <div className="shrink-0 border-t border-white/5 p-3">
        <div
          className={`flex items-center rounded-xl bg-white/[0.04] ${
            collapsed ? "justify-center p-2" : "gap-3 p-2.5"
          }`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-munsell_blue text-xs font-bold text-white ring-2 ring-white/10">
            {profile.avatar ? (
              <img
                src={profile.avatar}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : initials !== "B" ? (
              initials
            ) : (
              <FiUser size={16} />
            )}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-white">
                  {displayName}
                </p>
                <p className="truncate text-[11px] text-white/45">
                  {profile.email || "No email set"}
                </p>
              </div>
              <button
                type="button"
                onClick={logout}
                title="Log out"
                aria-label="Log out"
                className="shrink-0 cursor-pointer rounded-lg p-2 text-white/45 transition-colors hover:bg-white/10 hover:text-white">
                <FiLogOut size={15} />
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={`${collapsed ? "Expand" : "Collapse"} sidebar (${MOD_KEY}B)`}
          className={`mt-2 flex h-9 w-full cursor-pointer items-center rounded-lg text-[13px] font-medium text-white/40 transition-colors hover:bg-white/[0.07] hover:text-white ${
            collapsed ? "justify-center" : "gap-2.5 px-3"
          }`}>
          {collapsed ? (
            <FiChevronsRight size={17} />
          ) : (
            <>
              <FiChevronsLeft size={17} />
              Collapse
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
