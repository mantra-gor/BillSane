import type { ComponentType } from "react";
import { BiReceipt } from "react-icons/bi";
import { FiDatabase, FiSettings, FiSliders, FiUser } from "react-icons/fi";
import { MdTimeline } from "react-icons/md";
import { RxDashboard } from "react-icons/rx";

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
        keywords: ["bill", "create", "pos", "sell", "checkout", "counter"],
      },
      {
        title: "Sales",
        description: "Search and revisit every invoice",
        icon: MdTimeline,
        path: "/sales",
        shortcut: "3",
        keywords: ["history", "invoices", "ledger", "transactions"],
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
        shortcut: "4",
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
    keywords: ["gst", "gstin", "logo", "address", "company", "configuration"],
  },
  {
    title: "Database",
    description: "Where BillSane stores its data",
    icon: FiDatabase,
    path: "/settings/database",
    keywords: ["sqlite", "postgres", "mysql", "connection", "backup"],
  },
  {
    title: "Appearance",
    description: "Density and display preferences",
    icon: FiSettings,
    path: "/settings/appearance",
    keywords: ["theme", "density", "display", "look"],
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
