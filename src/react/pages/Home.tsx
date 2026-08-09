import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router";
import Sidebar from "../components/common/Sidebar";
import Topbar from "../components/common/Topbar";
import CommandPalette from "../components/common/CommandPalette";
import { visibleNavGroups } from "../router/navigation";
import { hasModifier } from "../hooks/usePlatform";
import { useAuth } from "../auth/authContext";

const COLLAPSE_KEY = "sidebarCollapsed";

/**
 * The authenticated app frame: fixed dark sidebar, sticky topbar, and a single
 * scrolling content column. Pages render their own padding so full-bleed
 * screens (the invoice counter) can opt out.
 */
function Home() {
  const navigate = useNavigate();
  const { user, can, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === "true"
  );
  const [paletteOpen, setPaletteOpen] = useState(false);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      localStorage.setItem(COLLAPSE_KEY, String(!prev));
      return !prev;
    });
  }, []);

  // The nav is filtered by what this user may reach, so the shortcuts below
  // walk the same list the sidebar draws — ⌘3 can't jump a cashier to a screen
  // that isn't in their sidebar.
  const groups = useMemo(() => visibleNavGroups(can), [can]);

  // Global shortcuts. Anything typed into a field is left alone unless it
  // carries the platform modifier, so ⌘N still works from inside a form.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = hasModifier(e);

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }
      if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapsed();
        return;
      }
      if (mod && e.key.toLowerCase() === "n" && can("invoice:create")) {
        e.preventDefault();
        navigate("/invoice-create");
        return;
      }

      // ⌘1–⌘4 jump between the primary screens, in sidebar order.
      if (mod && /^[1-9]$/.test(e.key)) {
        const target = groups
          .flatMap((group) => group.items)
          .find((item) => item.shortcut === e.key);
        if (target) {
          e.preventDefault();
          navigate(target.path);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, toggleCollapsed, groups, can]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas">
      <div className="shrink-0">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          groups={groups}
          user={user}
          onSignOut={signOut}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenCommandPalette={() => setPaletteOpen(true)} />
        <main className="scroll-area min-h-0 flex-1">
          <Outlet />
        </main>
      </div>

      {paletteOpen && (
        <CommandPalette onClose={() => setPaletteOpen(false)} />
      )}
    </div>
  );
}

export default Home;
