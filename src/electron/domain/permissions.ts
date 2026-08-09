/**
 * The permission catalog.
 *
 * Roles are data — the owner invents as many as the business needs — but the
 * permissions they are assembled from are fixed here, because a permission only
 * means anything if some handler checks it. A role holding "reports:export"
 * would be a promise the app can't keep, so the catalog is the closed set and
 * `isPermission` rejects everything else on the way in.
 *
 * Keys are `area:verb` and deliberately match the IPC channels they gate, so
 * the guard on a handler reads as the same words as the checkbox that grants it.
 *
 * Read vs. manage is the one split worth knowing: `:view` is what a screen needs
 * to open, `:manage` is what changing something needs. That is what lets a
 * cashier see the item catalog while ringing up a sale without being able to
 * reprice it.
 */
export const PERMISSION_GROUPS = [
  {
    label: "Dashboard",
    description: "Business performance",
    permissions: [
      {
        key: "dashboard:view",
        label: "View dashboard",
        description: "Revenue, trends, top items and reorder alerts",
      },
    ],
  },
  {
    label: "Billing",
    description: "Invoices and the counter",
    permissions: [
      {
        key: "invoice:create",
        label: "Create invoices",
        description: "Ring up a sale, which also moves stock",
      },
      {
        key: "invoice:view",
        label: "View sales history",
        description: "Open the ledger and re-print past invoices",
      },
      {
        key: "invoice:delete",
        label: "Delete invoices",
        description: "Cancel a sale and return its goods to stock",
      },
    ],
  },
  {
    label: "Customers",
    description: "The customer directory",
    permissions: [
      {
        key: "customer:view",
        label: "View customers",
        description: "Browse the directory and each customer's history",
      },
      {
        key: "customer:manage",
        label: "Edit customers",
        description: "Correct contact details and delete records",
      },
    ],
  },
  {
    label: "Inventory",
    description: "Products, services and stock",
    permissions: [
      {
        key: "inventory:view",
        label: "View inventory",
        description: "See the catalog, prices and stock levels",
      },
      {
        key: "inventory:manage",
        label: "Edit inventory",
        description: "Add, edit, delete and bulk-import items",
      },
    ],
  },
  {
    label: "Settings",
    description: "How BillSane is configured",
    permissions: [
      {
        key: "settings:business",
        label: "Edit business details",
        description: "Company name, GSTIN, address and logo on every invoice",
      },
      {
        key: "settings:database",
        label: "Manage data storage",
        description: "Offline/hybrid mode and cloud database credentials",
      },
    ],
  },
  {
    label: "People",
    description: "Who can use BillSane",
    permissions: [
      {
        key: "users:manage",
        label: "Manage users",
        description: "Add staff, assign roles and reset passwords",
      },
      {
        key: "roles:manage",
        label: "Manage roles",
        description: "Create roles and choose what each one can do",
      },
    ],
  },
] as const;

export type Permission =
  (typeof PERMISSION_GROUPS)[number]["permissions"][number]["key"];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap(
  (group) => group.permissions.map((permission) => permission.key)
);

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

/** Guards the boundary: anything the renderer sends that isn't in the catalog. */
export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && PERMISSION_SET.has(value);
}

/** Drops unknown keys and duplicates, preserving catalog order for stable diffs. */
export function sanitizePermissions(values: readonly unknown[]): Permission[] {
  const wanted = new Set(values.filter(isPermission));
  return ALL_PERMISSIONS.filter((permission) => wanted.has(permission));
}

/**
 * The catalog as the renderer draws it — the Roles screen renders these groups
 * verbatim, so a new permission shows up in the UI the moment it exists here.
 */
export interface PermissionInfo {
  key: Permission;
  label: string;
  description: string;
}

export interface PermissionGroupInfo {
  label: string;
  description: string;
  permissions: PermissionInfo[];
}

export function getPermissionCatalog(): PermissionGroupInfo[] {
  return PERMISSION_GROUPS.map((group) => ({
    label: group.label,
    description: group.description,
    permissions: group.permissions.map((permission) => ({ ...permission })),
  }));
}
