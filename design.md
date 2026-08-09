# BillSane — Design Document

> BillSane is a next-generation billing and invoice management application that is
> growing into a lightweight **ERP** for small and mid-sized businesses. Beyond
> generating invoices, it monitors the health of the business and surfaces
> actionable insights to the owner, with multi-role access control layered on top.

This document describes the product vision, the system architecture, the design
system, the domain model, and the roadmap. It reflects the **current state of the
code** and clearly flags what is implemented versus planned.

---

## 1. Vision & Scope

### 1.1 What BillSane is
- A **cross-platform desktop application** (macOS, Windows, Linux) built on Electron.
- A **billing & invoicing** tool: create invoices, add line items, compute tax and
  totals, choose a payment method, print/export a branded invoice.
- Growing into an **ERP-lite**: a single place where a business owner can watch
  sales, revenue, tax liability, and other operational signals, and act on them.

### 1.2 Product pillars
1. **Simplify billing** — fast invoice creation with sensible defaults ("Make your
   finances sane").
2. **Insight, not just data** — the Dashboard turns raw transactions into a picture
   of business health for the owner.
3. **Role-aware** — different people in a business see and do different things
   (owner/admin, cashier/staff, accountant, etc.).
4. **Offline-first desktop** — runs as a native app, not just a web page.

### 1.3 Target market
- India-first (INR `₹`, GST fields, `en-IN` number formatting), designed so the
  currency/tax model can be generalized later.

---

## 2. Personas & Roles

BillSane runs on **custom roles**: a role is a named set of permissions, created by the
owner at runtime, and there is no fixed list of them in the code. Role-based access
control is **implemented** — see §7.5.

The starter roles the first launch seeds are ordinary data, editable and deletable:

| Role | Primary goals | Seeded permissions |
|------|---------------|--------------------|
| **Administrator** *(built in)* | See and configure the whole business | Everything, including any permission added in a future release |
| **Manager** | Run day-to-day operations | Dashboard, all invoicing, customers, inventory, business details |
| **Cashier / Staff** | Ring up sales quickly | Create invoices, view customers, view inventory |
| **Accountant** | Reconcile & report | Dashboard, view invoices, view customers, view inventory |

### 2.1 Permission model
- The **permission catalog** is closed and lives in code
  ([domain/permissions.ts](src/electron/domain/permissions.ts)): twelve keys spelled
  `area:verb`, grouped for the Roles screen. Roles are data; permissions are not,
  because a permission only means something if a handler checks it.
- **`:view` opens a screen, `:manage` changes something.** That split is what lets a
  cashier see the item catalog while billing without being able to reprice it.
- The authenticated user carries `{ id, name, email, role, permissions[] }` and every
  screen asks `can(...permissions)` — satisfied by **any** of the listed keys, so
  shared screens (the invoice counter's item search) work for two different roles
  without either being over-granted.
- **Enforcement is in the main process, not the router.** Each IPC handler declares
  its own requirement via `ipcHandleGuarded`, checked against the session the main
  process holds. Hiding a route is presentation; the guard is the gate.
- The **Administrator** role is locked: it can't be renamed, re-scoped or deleted, and
  it resolves to the whole catalog at read time rather than storing grants — so a
  permission introduced later reaches the owner with no migration.
- One invariant is enforced everywhere: **there must always be an active account that
  can manage users.** Suspend, delete, demote, or strip `users:manage` off the last
  role that grants it, and the change is refused with a message naming the fix.

---

## 3. Architecture

### 3.1 High level
BillSane is an Electron app with two cooperating processes:

```
┌─────────────────────────────────────────────────────────────┐
│  Electron Main process  (src/electron)                       │
│  • Creates the BrowserWindow, loads the UI                   │
│  • dev  → http://localhost:5123 (Vite)                       │
│  • prod → dist-react/index.html (loadFile)                   │
│  • Type-safe IPC via preload contextBridge (window.electron) │
└───────────────▲──────────────────────────────┬──────────────┘
                │ IPC (invoke / on)             │ exposes window.electron
┌───────────────┴──────────────────────────────▼──────────────┐
│  Renderer process  (src/react)                               │
│  • React 19 + TypeScript, Vite bundling                      │
│  • HashRouter → App → config-based Router (useRoutes)        │
│  • TailwindCSS design system                                 │
│  • Forms: react-hook-form + yup                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Tech stack

| Concern | Choice |
|---------|--------|
| Desktop shell | Electron 43 |
| UI framework | React 19 |
| Language | TypeScript 6 (strict) |
| Bundler / dev server | Vite 8 (renderer → `dist-react`), `tsc` (electron → `dist-electron`) |
| Packaging | electron-builder (`dmg` / `msi`+`portable` / `AppImage`) |
| Routing | react-router 8 (`HashRouter`, config-based `useRoutes`) |
| Styling | TailwindCSS 3.4 (+ styled-components available) |
| Forms & validation | react-hook-form 7, yup, `@hookform/resolvers` |
| Tables | react-data-table-component |
| Printing | react-to-print |
| Icons | react-icons |

### 3.3 Process boundaries & IPC
- The preload script ([preload.cts](src/electron/preload.cts)) exposes a **typed**
  `window.electron` API through `contextBridge`. IPC payloads are described by
  `EventPayloadMapping` in [types.d.ts](types.d.ts).
- `util.ts` includes `validateEventFrame` to reject IPC from unexpected frames — the
  security posture is "renderer talks to main only through the vetted bridge."
- **Note:** the current IPC surface (`subscribeStatistics`, `getStaticData`,
  `Statistics`, `StaticData`) is **leftover from the Electron Resource Monitor
  starter** this project was scaffolded from. It is not part of the billing domain and
  should be replaced by billing/ERP IPC (or removed) as the app matures.

### 3.4 Rendering & routing
- Entry: [main.tsx](src/react/main.tsx) mounts `<HashRouter><App/></HashRouter>`.
  `HashRouter` is used because the app is served from the filesystem (`file://`) in
  production, where hash routing is the safe choice.
- [Router.tsx](src/react/router/Router.tsx) declares the full route tree with
  `useRoutes`:

```
/ (BlankLayout)
├── /sign-in            → AuthRoute → AuthLayout formType="signin"
├── /setup              → AuthRoute → AuthLayout formType="setup"   (first run only)
├── / (ProtectedRoute → Home: Sidebar + Topbar + Outlet)
│   ├── index          → first screen this user may open (landingPath)
│   ├── /dashboard     → Dashboard          [dashboard:view]
│   ├── /invoice-create→ InvoiceCreate      [invoice:create]
│   ├── /invoice/view  → Invoice            [invoice:view | invoice:create]
│   ├── /sales         → Sales              [invoice:view]
│   ├── /customers     → Customers          [customer:view]
│   ├── /inventory     → Inventory          [inventory:view]
│   └── /settings      → Settings (nested tabs, rail filtered by permission)
│       ├── /settings/accounts   → Account       (always available)
│       ├── /settings/users      → Users         [users:manage]
│       ├── /settings/roles      → Roles         [roles:manage]
│       ├── /settings/config     → Configurations[settings:business]
│       ├── /settings/database   → Database      [settings:database]
│       └── /settings/appearance → Appearance    (always available)
└── *                  → Not Found
```

Every protected route names its permission, and `ProtectedRoute` also intercepts two
states before any screen renders: no accounts yet → `/setup`, and a user still holding
an admin-issued temporary password → the change-password gate.

---

## 4. Application structure

```
src/
├── electron/                  Main process (compiled with its own tsconfig)
│   ├── main.ts                Window creation + load URL/file
│   ├── preload.cts            contextBridge → window.electron (typed IPC)
│   ├── util.ts                isDev, ipcHandle, frame validation
│   ├── ipc/guard.ts           ipcHandleGuarded — the permission gate on every channel
│   ├── domain/session.ts      The signed-in session; requirePermission()
│   ├── domain/permissions.ts  The permission catalog (closed set)
│   ├── domain/{users,roles}.ts Accounts and custom roles
│   ├── resourceManager.ts     (leftover from starter — inert)
│   └── pathResolver.ts        Preload/UI path resolution
│
└── react/                     Renderer (the product UI)
    ├── main.tsx               React root + HashRouter
    ├── App.tsx                Global shell (e.g. zoom-shortcut guard) → Router
    ├── index.css              Tailwind layers + bespoke utilities
    ├── auth/
    │   ├── AuthProvider.tsx   Boots the session before any route renders
    │   └── authContext.ts     useAuth() → status / user / permissions / can()
    ├── router/
    │   ├── Router.tsx         Central route config
    │   ├── navigation.ts      Nav manifest + permission filtering
    │   ├── ProtectedRoute.tsx Signed-in + permission gate
    │   └── AuthRoute.tsx      Signed-out routing (/sign-in vs /setup)
    ├── pages/
    │   ├── Home.tsx           Authenticated shell (sidebar + content)
    │   ├── Dashboard.tsx      Insights home
    │   ├── InvoiceCreate.tsx  Invoice builder (line items, tax, payment)
    │   ├── SignIn.tsx / Setup.tsx / ForcePassword.tsx
    │   └── Settings.tsx + Settings/{Account,Users,Roles,Configurations,Database,Appearance}.tsx
    ├── components/
    │   ├── common/Sidebar.tsx
    │   ├── core/layout/       AppLayout, AuthLayout, BlankLayout
    │   ├── core/graphics/     BackgroundGraphic1
    │   ├── ui/elements/       Button, Input, FormInput, LabeledInput, CustomDataTable
    │   └── ui/spinners/       FallbackSpinner
    └── assets/                branding, resources (icons, video), lottie

src/invoice-templates/         Print-ready invoice (Invoice.tsx + style.css)
types.d.ts                     Global ambient types (domain + IPC + component props)
```

Layering intent:
- **layout** components define page frames (blank, auth, app shell).
- **ui/elements** are reusable primitives (buttons, inputs, tables).
- **pages** compose elements + domain logic; one page per route.
- **invoice-templates** is intentionally separate: print output, not app chrome.

---

## 5. Design System

### 5.1 Brand & palette
Defined as Tailwind color scales in [tailwind.config.js](tailwind.config.js)
(see also `BillSane-Color-Palette.png`). Each color exposes a `DEFAULT` plus a
`5`–`950` scale.

| Token | DEFAULT | Role |
|-------|---------|------|
| `prussian_blue` | `#053247` | Primary brand / active nav / primary buttons |
| `munsell_blue` | `#298E9E` | Secondary accent / headers / table head |
| `primary` (neutral grays) | `#F7F7F7` | Backgrounds, surfaces, disabled states |

Usage conventions already in the code:
- Primary action → `bg-prussian_blue text-white` (see [Button.tsx](src/react/components/ui/elements/Button.tsx)).
- Active nav item → `bg-prussian_blue text-white rounded-lg` (Sidebar), active tab →
  `bg-munsell_blue text-white` (Settings).
- App background → `bg-primary-5`; surfaces → `bg-white` with `border shadow-xl`,
  rounded `rounded-2xl`.
- Data table head → `#298E9E` on white, zebra rows on `#EBEBEB`
  (see [CustomDataTable.tsx](src/react/components/ui/elements/CustomDataTable.tsx)).

### 5.2 Layout language
- Rounded, card-based surfaces (`rounded-2xl`, `shadow-xl`, subtle `border`).
- Fixed left sidebar (~250–300px) + scrollable content region (see
  [Home.tsx](src/react/pages/Home.tsx)).
- Inputs use an inset bottom shadow for a soft "pressed" affordance.
- Desktop app feel: zoom keyboard shortcuts are suppressed globally in
  [App.tsx](src/react/App.tsx); horizontal overflow hidden; text is
  non-selectable by default (`index.css`).

### 5.3 Reusable primitives
| Component | Purpose |
|-----------|---------|
| `Button` | Primary/secondary button; `active` toggles brand vs neutral fill |
| `Input` | Bare controlled input with shared styling |
| `FormInput` / `LabeledInput` | Labeled variants for forms |
| `CustomDataTable` | Themed wrapper over react-data-table-component |
| `FallbackSpinner` | Suspense/loading fallback |
| `BackgroundGraphic1` | Decorative background used on auth screens |

### 5.4 Typography & iconography
- System font stack via Tailwind defaults.
- Icons from `react-icons` (Rx, Md, Bi, Pi sets in use).

---

## 6. Domain Model

Domain types currently live as ambient globals in [types.d.ts](types.d.ts). As the
data model grows, these should move into a dedicated `src/react/types/` (or a shared
`domain` module) and stop being global.

### 6.1 Implemented
```ts
// A single row on an invoice
interface LineItem {
  id: number;
  itemName?: string;
  rate?: number;     // unit price (₹)
  taxType?: number;  // e.g. GST label
  taxPer?: number;   // tax percentage
  qty?: number;
  tax?: number;      // computed: rate * qty * taxPer / 100
  subTotal?: number; // computed: rate * qty + tax
}
```
Invoice assembly (in [InvoiceCreate.tsx](src/react/pages/InvoiceCreate.tsx)) builds a
`billData` shape passed via router state to the print template:
```
{ date, customerDetails: { name, phone, email }, lineItems[],
  totalAmount, totalTax, totalDiscount, payment_type, invoiceNo }
```

### 6.2 Proposed entities (roadmap)
As BillSane becomes an ERP, formalize:
- **Business** — name, GSTIN, address, contact, logo, currency, tax config.
  *(Currently hardcoded inside [Invoice.tsx](src/invoice-templates/Invoice.tsx).)*
- ~~**User**~~ — *implemented*: `app_user` + `role` + `role_permission` (§7.5).
- **Customer** — persisted contacts (name, phone, email, history).
- **Product / Item** — catalog for autocomplete instead of free-text item names.
- **Invoice** — persisted record with status (draft/paid/void), auto-generated number,
  timestamps, customer ref, line items, totals, payment.
- **Payment** — method (`cash` / `card` / `upi`), amount, reference.
- **Insight / Metric** — aggregates the Dashboard reads (revenue, tax, top items…).

---

## 7. Feature Areas

### 7.1 Invoicing — *implemented*
- Add/remove line items in a data table; per-row tax and subtotal computed live.
- Discount, total tax, and total amount computed on change.
- Payment type selector (Cash / Card / UPI) with iconography.
- Customer details captured with validation (name, 10-digit phone, email).
- Submit → navigate to a **print-ready invoice** ([Invoice.tsx](src/invoice-templates/Invoice.tsx))
  rendered with `react-to-print`; `Ctrl/Cmd+P` prints, `Ctrl/Cmd+←` returns to edit.

**Known gaps:** invoice number is hardcoded; business details are hardcoded; a yup
schema + `useFieldArray` refactor is started but commented out; no persistence.

### 7.2 Dashboard / Insights — *to be built*
This is the ERP heart. [Dashboard.tsx](src/react/pages/Dashboard.tsx) is a stub. Intended
content:
- KPI tiles: revenue, invoices issued, tax collected, outstanding.
- Trends over time (sales by day/week/month).
- Breakdowns: top items, payment-method mix, customer concentration.
- Owner-facing alerts (e.g. dips, tax due).

### 7.3 Sales — *placeholder*
`/sales` currently renders text. Intended: a searchable/filterable ledger of invoices
with drill-down and export.

### 7.4 Settings — *partially implemented*
Tabbed area ([Settings.tsx](src/react/pages/Settings.tsx)), with the rail filtered by
permission — a cashier sees Account and Appearance and nothing else:
- **Account** — profile (name, email, phone, photo), a working password change, what
  the current role allows, and sign out. Always reachable by every account.
- **Users** — the only way an account is created after the first one (`users:manage`).
- **Roles** — create roles and tick what each one may do (`roles:manage`).
- **Business** — company details printed on every invoice (`settings:business`).
- **Database** — offline/hybrid and cloud credentials (`settings:database`).
- **Appearance** — default sidebar state + the brand palette reference. Light-only:
  dark mode is deliberately out of scope.

### 7.5 Authentication & RBAC — *implemented*

Accounts live in the database (`app_user`, `role`, `role_permission`) and the session
lives in the main process.

- **No sign-up, ever.** A fresh install has no accounts, so `/setup` runs once: it
  creates a single Administrator and then becomes unreachable. Nothing ships a default
  credential. Everyone else is added in Settings → Users.
- **Passwords** are hashed with node's built-in **scrypt**
  ([domain/password.ts](src/electron/domain/password.ts)) — chosen over bcrypt/argon2
  because those are native modules needing a per-platform ABI rebuild in Electron. The
  hash never crosses the IPC bridge.
- **Sessions** are main-process memory. "Keep me signed in" writes the user id through
  `safeStorage` (OS-keychain backed, 30-day expiry); on restore the role and active
  flag are re-read from the database, never trusted from the file. Any user or role
  change re-resolves the live session, so revoking access takes effect immediately.
- **Temporary passwords.** An admin-issued password sets `mustChangePassword`, and the
  app shows nothing but the change-password screen until it is replaced.
- **Suspend beats delete** for someone who has left: their history keeps a name against
  it and the login stops working the same minute.
- **Planned:** password strength beyond a length floor, an audit trail of who changed
  what, and per-branch scoping once multi-branch lands.

### 7.6 Inventory & the item catalog — *implemented*

`Product` backs both `/inventory` and the item search on an invoice line. Items appear
three ways: typed at the counter (auto-created by `invoice:create`), added by hand, or
**imported in bulk from a CSV**.

#### 7.6.1 Bulk import — *implemented*

The onboarding problem this solves: every shop that would adopt BillSane already keeps
its stock somewhere — an Excel sheet, a Google Sheet, a Tally export — and retyping four
hundred items is the reason they don't switch. Import has to be good enough that the
first five minutes with the app end with their real catalog in it.

**The flow is always preview-then-commit.** `product:importPreview` parses the file,
matches every row against the catalog and reports what *would* happen; nothing is
written until the owner has read it and pressed Import. `product:import` then re-parses
the same text inside one transaction and applies it — the preview is a report, not a
payload, so what was shown and what is written cannot drift.

Design rules, each of them load-bearing:

- **Only `Item Name` is required.** Headers are folded (case, spacing, punctuation, `%`
  → `percent`) and matched against a generous alias table, so `Particulars`, `Qty`,
  `GST%`, `Reorder Level` and `UOM` all land where they should. Unrecognised columns are
  listed in the preview rather than silently dropped, because a silent drop is
  indistinguishable from a typo. A bare `Tax` column is resolved from its own contents —
  all-numeric is a rate, anything else a label.
- **A blank cell means "leave it alone", never "clear it".** A sheet carrying only names
  and quantities is a stock count, and must not wipe every price. A column absent from
  the header is never touched at all.
- **Existing items are matched by item code first, then by folded name** (the same
  `normalizeName` natural key the counter uses). That is what makes re-importing a
  corrected sheet safe, and what lets the sheet fix a spelling without forking the item.
- **`unchanged` is a distinct outcome from `update`.** Re-importing last week's file with
  three edits reports "3 updates, 412 unchanged" — a number the owner can sanity-check.
- **A bad row is skipped, not fatal.** Every row is validated independently and reports
  every complaint it has, addressed by the line number *in the user's file*. The good
  rows still import; the bad ones are listed afterwards to fix and re-run.
- **Money is read the way it was typed** — `₹1,250.00`, `1250/-`, `18%` and ` 1250 ` are
  all one number. Units are aliased (`Pieces` → `pcs`, `Kgs` → `kg`).
- **Services never carry stock**, matching the rest of the catalog's rules; stock is
  still allowed to be negative, because the app already records oversold items.
- **The example file is generated, not written twice.** `IMPORT_TEMPLATE_CSV` is the
  single source; Download example file saves it through a native dialog and reveals it,
  and [examples/inventory-import-example.csv](examples/inventory-import-example.csv) is a
  regenerated copy for reading in the repo.

**Not yet built:** export of the current catalog (the natural other half of a
round-trip — edit in Excel, re-import), per-row deselection in the preview, and a
downloadable file of just the failed rows. Customers are the obvious next entity to give
the same treatment; the parser in `domain/csv.ts` and the preview-then-commit shape are
deliberately entity-agnostic.

---

## 8. Non-functional considerations

- **Offline-first:** as a desktop app, core billing should work without a network; a
  local datastore (e.g. SQLite/electron-store) is the natural next step for
  persistence.
- **Security:** keep the contextBridge boundary strict; never expose Node APIs
  directly to the renderer; validate IPC frames (already scaffolded in `util.ts`).
- **Printing fidelity:** invoice layout must render identically on screen and paper;
  print-only CSS utilities live in `index.css`.
- **i18n / currency:** currently INR + `en-IN` hardcoded; abstract into business config
  to support other locales.
- **Accessibility:** `user-select: none` and `tabIndex={-1}` are used for a native feel
  — revisit to ensure keyboard/AT users are not locked out.

---

## 9. Roadmap (suggested sequencing)

1. **Persistence layer** — introduce a local datastore + domain entities (§6.2).
2. ~~**Real auth + RBAC**~~ — *done*: accounts, custom roles, and permission checks
   enforced in the main process (§2, §7.5).
3. **Business configuration** — move hardcoded business/invoice-number data into
   Settings → Configurations.
4. **Dashboard insights** — build the KPI/trends experience (§7.2).
5. **Sales ledger** — persisted, searchable invoice history (§7.3).
6. **Bulk data in and out** — CSV import for customers, and catalog/ledger export, on
   the preview-then-commit shape inventory import already uses (§7.6.1).
7. **Cleanup** — remove Electron-Resource-Monitor leftovers, refresh the README, and
   migrate ambient globals into typed modules.

---

## 10. Open questions

- Where does data live — local-only, cloud-synced, or hybrid?
- Is there a backend/API, or is BillSane fully client-side for now?
- Should an audit trail record who created, voided or re-priced what? RBAC makes the
  question answerable for the first time.
- What is the tax model beyond simple per-line GST (CGST/SGST/IGST split, HSN codes)?
- Multi-business / multi-branch support in scope?
