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

BillSane is designed around **multiple roles with distinct permissions**. Role-based
access control (RBAC) is **planned** — the routing layer already threads an
`allowedRole` prop, and the check is currently stubbed (see
[ProtectedRoute.tsx](src/react/router/ProtectedRoute.tsx)).

| Role | Primary goals | Representative permissions (planned) |
|------|---------------|--------------------------------------|
| **Owner / Admin** | See the whole business, configure it | Full access: dashboard/insights, all invoices, sales, users & roles, settings, business config |
| **Manager** | Run day-to-day operations | Create/view invoices, view sales & dashboard, limited settings |
| **Cashier / Staff** | Ring up sales quickly | Create invoices, take payments; no dashboard/insights, no settings |
| **Accountant** | Reconcile & report | Read invoices/sales, tax reports, exports; no user management |

### 2.1 Permission model (proposed)
- A **role** is a named set of **permissions** (e.g. `invoice:create`,
  `dashboard:view`, `users:manage`, `settings:edit`).
- Routes and UI affordances are gated by permission, not just by role, so roles stay
  composable.
- The authenticated user carries `{ id, name, accountType/role, permissions[] }`.
- `ProtectedRoute` should evolve from a boolean login check to
  `hasPermission(user, requiredPermission)`.

> **Current state:** auth is a static `localStorage` flag (`isUserLoggedIn`). No real
> user object, roles, or permission enforcement yet. Role plumbing exists but is
> commented out.

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
├── /sign-in            → AuthLayout formType="signin"
├── /sign-up            → AuthLayout formType="signup"
├── / (ProtectedRoute → Home: Sidebar + AppLayout + Outlet)
│   ├── index          → redirect /dashboard
│   ├── /dashboard     → Dashboard        (insights — to be built)
│   ├── /invoice-create→ InvoiceCreate
│   ├── /invoice/view  → Invoice          (print template)
│   ├── /sales         → Sales            (placeholder)
│   └── /settings      → Settings (nested tabs)
│       ├── /settings/accounts   → Account
│       ├── /settings/security   → Security
│       ├── /settings/appearance → Appearance
│       └── /settings/config     → Configurations
└── *                  → Not Found
```

---

## 4. Application structure

```
src/
├── electron/                  Main process (compiled with its own tsconfig)
│   ├── main.ts                Window creation + load URL/file
│   ├── preload.cts            contextBridge → window.electron (typed IPC)
│   ├── util.ts                isDev, ipcHandle, frame validation
│   ├── resourceManager.ts     (leftover from starter — inert)
│   └── pathResolver.ts        Preload/UI path resolution
│
└── react/                     Renderer (the product UI)
    ├── main.tsx               React root + HashRouter
    ├── App.tsx                Global shell (e.g. zoom-shortcut guard) → Router
    ├── index.css              Tailwind layers + bespoke utilities
    ├── router/
    │   ├── Router.tsx         Central route config
    │   └── ProtectedRoute.tsx Auth/role gate (role check stubbed)
    ├── pages/
    │   ├── Home.tsx           Authenticated shell (sidebar + content)
    │   ├── Dashboard.tsx      Insights home (stub)
    │   ├── InvoiceCreate.tsx  Invoice builder (line items, tax, payment)
    │   ├── SignIn.tsx / SignUp.tsx
    │   └── Settings.tsx + Settings/{Account,Security,Appearance,Configurations}.tsx
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
- **User** — id, name, email, role, permissions, credentials.
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
Tabbed area ([Settings.tsx](src/react/pages/Settings.tsx)):
- **Account** — profile; currently only a working password **Logout** (clears `localStorage`).
- **Appearance** — stub (theme; palette already tokenized for this).
- **Configurations** — stub (business profile, tax setup, invoice numbering, roles).

### 7.5 Authentication — *static placeholder*
- [SignIn.tsx](src/react/pages/SignIn.tsx) validates inputs, then sets
  `localStorage.isUserLoggedIn = "true"` and navigates to `/dashboard`. No backend.
- **Planned:** real auth (API or local account store), a user/session object, and the
  RBAC described in §2.

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
2. **Real auth + RBAC** — replace the `localStorage` flag with a user/session and
   permission-gated routes (§2).
3. **Business configuration** — move hardcoded business/invoice-number data into
   Settings → Configurations.
4. **Dashboard insights** — build the KPI/trends experience (§7.2).
5. **Sales ledger** — persisted, searchable invoice history (§7.3).
6. **Cleanup** — remove Electron-Resource-Monitor leftovers, refresh the README, and
   migrate ambient globals into typed modules.

---

## 10. Open questions

- Where does data live — local-only, cloud-synced, or hybrid?
- Is there a backend/API, or is BillSane fully client-side for now?
- How are roles assigned in a single-owner desktop install vs. multi-user businesses?
- What is the tax model beyond simple per-line GST (CGST/SGST/IGST split, HSN codes)?
- Multi-business / multi-branch support in scope?
