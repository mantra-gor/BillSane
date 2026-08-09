import type { ComponentType } from "react";
import { BiReceipt } from "react-icons/bi";
import {
  FiDatabase,
  FiPackage,
  FiSettings,
  FiShield,
  FiSliders,
  FiUser,
  FiUserCheck,
  FiUsers,
} from "react-icons/fi";
import { MdTimeline } from "react-icons/md";
import { RxDashboard } from "react-icons/rx";
import type { Permission } from "../utils/authStore";

export interface NavItem {
  title: string;
  /** Short description, shown in the command palette. */
  description?: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  path: string;
  /** Single-letter accelerator, chorded with the platform modifier. */
  shortcut?: string;
  /** Extra terms the command palette should match on. */
  keywords?: string[];
  /**
   * What a user needs to see this screen — any one of them is enough. Omitted
   * means every signed-in user gets it.
   *
   * Declared here rather than in the route tree so the sidebar, the topbar, the
   * command palette and the router all gate on the same fact. Registering the
   * route is still separate (Router.tsx), and it passes this same list to
   * `ProtectedRoute` — so a screen that is hidden is also unreachable by URL.
   */
  permission?: Permission[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * The single source of truth for app navigation. The sidebar renders it as
 * groups, the topbar reads titles off it, and the command palette searches it —
 * so adding a screen here surfaces it in all three at once.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        title: "Dashboard",
        description: "Revenue, trends and business insights",
        icon: RxDashboard,
        path: "/dashboard",
        shortcut: "1",
        permission: ["dashboard:view"],
        keywords: ["home", "insights", "analytics", "reports", "overview"],
      },
    ],
  },
  {
    label: "Billing",
    items: [
      {
        title: "New Invoice",
        description: "Ring up a sale and print a GST invoice",
        icon: BiReceipt,
        path: "/invoice-create",
        shortcut: "2",
        permission: ["invoice:create"],
        keywords: ["bill", "create", "pos", "sell", "checkout", "counter"],
      },
      {
        title: "Sales",
        description: "Search and revisit every invoice",
        icon: MdTimeline,
        path: "/sales",
        shortcut: "3",
        permission: ["invoice:view"],
        keywords: ["history", "invoices", "ledger", "transactions"],
      },
      {
        title: "Customers",
        description: "Everyone you've billed, and what they've spent",
        icon: FiUsers,
        path: "/customers",
        shortcut: "4",
        permission: ["customer:view"],
        keywords: ["clients", "people", "contacts", "phone", "email", "regulars"],
      },
      {
        title: "Inventory",
        description: "Products and services, their prices and what's in stock",
        icon: FiPackage,
        path: "/inventory",
        shortcut: "5",
        permission: ["inventory:view"],
        keywords: [
          "stock",
          "products",
          "items",
          "catalog",
          "services",
          "sku",
          "hsn",
          "price",
          "rate",
        ],
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        title: "Settings",
        description: "Business details, profile and data storage",
        icon: FiSettings,
        path: "/settings",
        shortcut: "6",
        keywords: ["preferences", "config", "options"],
      },
    ],
  },
];

/** Settings sub-navigation — also surfaced in the command palette. */
export const SETTINGS_TABS: NavItem[] = [
  {
    title: "Account",
    description: "Your name, contact details and photo",
    icon: FiUser,
    path: "/settings/accounts",
    keywords: ["profile", "logout", "sign out", "avatar"],
  },
  {
    title: "Business",
    description: "Company details printed on every invoice",
    icon: FiSliders,
    path: "/settings/config",
    permission: ["settings:business"],
    keywords: ["gst", "gstin", "logo", "address", "company", "configuration"],
  },
  {
    title: "Users",
    description: "Who can sign in, and as what",
    icon: FiUserCheck,
    path: "/settings/users",
    permission: ["users:manage"],
    keywords: ["staff", "team", "accounts", "people", "cashier", "password", "invite"],
  },
  {
    title: "Roles",
    description: "What each role is allowed to do",
    icon: FiShield,
    path: "/settings/roles",
    permission: ["roles:manage"],
    keywords: ["permissions", "access", "rbac", "security", "rights", "privileges"],
  },
  {
    title: "Database",
    description: "Where BillSane stores its data",
    icon: FiDatabase,
    path: "/settings/database",
    permission: ["settings:database"],
    keywords: ["sqlite", "postgres", "offline", "hybrid", "cloud", "sync", "connection", "backup"],
  },
  {
    title: "Appearance",
    description: "Density and display preferences",
    icon: FiSettings,
    path: "/settings/appearance",
    keywords: ["sidebar", "layout", "density", "display", "look"],
  },
];

const ALL_ITEMS = [...NAV_GROUPS.flatMap((group) => group.items), ...SETTINGS_TABS];

/** Resolves a pathname to its screen title, for the topbar. */
export function titleForPath(pathname: string): string {
  if (pathname.startsWith("/invoice/view")) return "Invoice";

  // Longest matching prefix wins, so /settings/database beats /settings.
  const match = ALL_ITEMS.filter((item) => pathname.startsWith(item.path)).sort(
    (a, b) => b.path.length - a.path.length
  )[0];

  return match?.title ?? "BillSane";
}

// --- Permission filtering ----------------------------------------------------
// `can` is `useAuth().can` — passed in rather than imported so this module stays
// free of React and can be read as the plain manifest it is.

export type PermissionCheck = (...permissions: Permission[]) => boolean;

export function canSee(item: NavItem, can: PermissionCheck): boolean {
  return !item.permission || can(...item.permission);
}

/** The sidebar's groups, with anything the user can't reach removed. */
export function visibleNavGroups(can: PermissionCheck): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSee(item, can)),
  })).filter((group) => group.items.length > 0);
}

export function visibleSettingsTabs(can: PermissionCheck): NavItem[] {
  return SETTINGS_TABS.filter((tab) => canSee(tab, can));
}

/**
 * Where "/" should land for this user.
 *
 * Not a hardcoded /dashboard: a cashier has no dashboard permission, and
 * bouncing them to a screen that immediately refuses them is a worse welcome
 * than opening on the counter they actually work at. Settings → Account is the
 * last resort because every account can always reach it.
 */
export function landingPath(can: PermissionCheck): string {
  const first = NAV_GROUPS.flatMap((group) => group.items).find((item) =>
    canSee(item, can)
  );
  return first?.path ?? "/settings/accounts";
}
