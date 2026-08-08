# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository. For the product
vision, architecture rationale, and roadmap, see [design.md](design.md).

## What this is

**BillSane** — a cross-platform **Electron + React + TypeScript** desktop app for
billing and invoice management, evolving into an ERP that gives business owners
insight into their operations, with multi-role access control. India-first
(INR `₹`, GST, `en-IN` formatting).

## Commands

```bash
npm run dev            # Run React (Vite :5123) + Electron together (main dev command)
npm run dev:react      # Vite dev server only
npm run dev:electron   # Transpile electron + launch Electron (NODE_ENV=development)
npm run build          # tsc -b + vite build → dist-react
npm run lint           # ESLint over the repo
npm run preview        # Preview the built renderer
npm run transpile:electron   # tsc for src/electron → dist-electron

# Packaging (electron-builder)
npm run dist:mac       # macOS arm64 dmg
npm run dist:win       # Windows x64 (portable + msi)
npm run dist:linux     # Linux x64 AppImage
```

There is **no test runner configured yet** (the stale README mentions Playwright/Vitest
from the starter template — they are not actually set up). Don't claim tests pass; if
tests are needed, add the tooling first.

## Architecture (two processes)

- **Main process** — [src/electron/](src/electron/). Creates the window
  ([main.ts](src/electron/main.ts)); loads `http://localhost:5123` in dev and
  `dist-react/index.html` in prod. Compiled by its own tsconfig to `dist-electron/`.
- **Renderer** — [src/react/](src/react/). The React UI, bundled by Vite.
- **Bridge** — [preload.cts](src/electron/preload.cts) exposes a typed
  `window.electron` via `contextBridge`; payload types live in [types.d.ts](types.d.ts).
  Keep the boundary strict — no raw Node in the renderer.

> ⚠️ The IPC surface (`subscribeStatistics`, `getStaticData`, `Statistics`,
> `StaticData`) and `resourceManager.ts` are **leftovers from the Electron Resource
> Monitor starter** this was scaffolded from. They are not billing features. Replace or
> remove them as real billing/ERP IPC is added — don't build on them.

## Data layer — two modes only

BillSane has exactly **two** data modes ([db/types.ts](src/electron/db/types.ts) `DbMode`):

- **`offline`** — local SQLite (`billsane.db` in userData) and nothing else.
- **`hybrid`** — the same local SQLite **plus** a PostgreSQL cloud database it syncs
  with. Local stays the read/write path so the app keeps working offline.

Rules that follow from this:

- SQLite is the runtime source of truth in *both* modes. `initializeDatabase()`
  ([connectionManager.ts](src/electron/db/connectionManager.ts)) always opens the local
  file and never blocks launch on the network. Don't reintroduce "pick your engine".
- **Cloud sync is not built yet.** Hybrid currently only persists + tests the Postgres
  credentials (encrypted via `safeStorage` in
  [configStore.ts](src/electron/db/configStore.ts)); Settings → Database says so
  honestly. The sync engine (change tracking, conflict resolution, background push/pull)
  is the next major piece of work — build it behind `mode === "hybrid"`.
- Entities and migrations must stay portable across **sqlite + postgres** (they run on
  both in hybrid), which is why migrations use TypeORM's `Table` builder rather than raw
  SQL and money columns go through `decimalTransformer`. MySQL support is gone —
  the `mysql2` dependency was removed.
- Old `db-config.json` files (the previous `backend: local|postgres|mysql` shape) are
  migrated on read: `postgres` → hybrid + cloud credentials, anything else → offline.

## Inventory & the item catalog

`Product` ([entities/Product.ts](src/electron/db/entities/Product.ts)) backs both
`/inventory` and the item search on an invoice line. Rules worth knowing before you
touch it:

- **`nameKey` is the natural key** — `normalizeName()` in
  [domain/products.ts](src/electron/domain/products.ts) folds case and collapses
  whitespace, the same trick `normalizeEmail` plays for customers. Match on it exactly;
  `LOWER(name) = ?` would throw away the index.
- **Typing a name that isn't in the catalog is a normal path, not an error.**
  `invoice:create` runs `resolveLineProducts`, which links or creates, so the counter
  never has to stop and set an item up first.
- **`stockQty === null` means "never counted"**, which is not the same as `0`. Stock
  movement skips nulls and skips `kind === "service"` entirely.
- **Selling is never blocked.** Stock is allowed to go negative; `/inventory` flags that
  as "Oversold" rather than refusing the sale.
- Invoice lines snapshot `itemName`/`rate`/`taxType`/`taxPer`, so the product FK is
  `ON DELETE SET NULL` — retiring a catalog item leaves issued invoices untouched.
- `invoice:create` and `invoice:delete` are **transactional** because they move stock.
  Keep them that way.

## Renderer layout

```
src/react/
├── main.tsx          React root + HashRouter (HashRouter is required for file:// prod)
├── App.tsx           ToastProvider + zoom-shortcut suppression → Router
├── router/
│   ├── Router.tsx        Central route config (useRoutes) — add routes HERE
│   ├── navigation.ts     NAV_GROUPS / SETTINGS_TABS — the nav manifest (see below)
│   └── ProtectedRoute.tsx Auth gate (role check currently stubbed)
├── hooks/usePlatform.ts   MOD_KEY / hasModifier — ⌘ on macOS, Ctrl elsewhere
├── pages/            One component per route (Dashboard, InvoiceCreate, Settings…)
│   └── Home.tsx      The authenticated shell: Sidebar + Topbar + <Outlet/> + hotkeys
├── components/
│   ├── common/       Sidebar, Topbar, CommandPalette, BrandMark
│   ├── core/layout/  AppLayout (page container), AuthLayout, BlankLayout
│   ├── core/graphics/BackgroundGraphic1
│   ├── ui/charts/    DashboardCharts (recharts)
│   ├── ui/feedback/  ToastProvider + toastContext (useToast)
│   └── ui/elements/  Button, Input, Select, Field, LabeledInput, Card, Badge,
│                     Modal, Skeleton, EmptyState, PageHeader, SegmentedControl,
│                     ImagePicker, StatTile, DatePicker, CustomDataTable,
│                     ProductSelect (react-select, for invoice item lookup)
└── assets/           branding, resources, lottie
src/invoice-templates/ Invoice.tsx — print-ready invoice (kept separate from app chrome)
```

**Navigation is a manifest.** [navigation.ts](src/react/router/navigation.ts) is the single
source for screens — the sidebar renders it, the topbar reads titles from it, and the
command palette (⌘K) searches it. Registering a screen there surfaces it in all three.
Registering the *route* is still separate, in `Router.tsx`.

## Conventions

- **Routing is centralized** in [Router.tsx](src/react/router/Router.tsx) using
  react-router's config-based `useRoutes`. To add a screen: create the page in
  `pages/`, then register it in the route tree (usually under the protected `Home`
  branch). Nested areas (like Settings) use `<Outlet/>`.
- **Styling is Tailwind-first, through semantic tokens.** The brand ramps in
  [tailwind.config.js](tailwind.config.js) are unchanged — `prussian_blue` (primary),
  `munsell_blue` (accent), `primary` (legacy grays) — but new code should reach for the
  semantic layer instead of raw ramps:
  - Text → `text-ink` / `ink-soft` / `ink-muted` / `ink-faint`.
  - Surfaces → `surface` (white), `surface-subtle`, `surface-muted`; page bg → `canvas`.
  - Hairlines → `border-line` (bare `border` already resolves to it), `line-strong`.
  - Dark chrome (sidebar, auth panel, invoice footer) → `shell`, `shell-raised`.
  - Status → `success` / `warning` / `danger` / `info`, each with `-soft`, `-border`,
    `-ink` variants for chips and banners.
  - Elevation → `shadow-xs` / `card` / `raised` / `pop` / `overlay`. Don't use
    `shadow-xl` on cards; the scale is deliberate.
  - Money, counts and IDs get the `tnum` utility so digits don't jitter.
- **Compose the primitives; don't hand-roll.** `Card` for panels, `PageHeader` for
  titles, `Field` + `Input`/`Select` for form rows (it owns the label/hint/error
  layout), `EmptyState` for zero states, `Skeleton*` for loading, `Modal` for
  confirmation, `useToast()` for save/delete feedback. Pages wrap their content in
  `AppLayout` for consistent padding and max-width.
- **Feedback goes through toasts,** not inline "Saved successfully" spans.
- Bespoke CSS utilities, the focus ring, scrollbars and print styles live in
  [index.css](src/react/index.css).
- **Forms** use `react-hook-form` with `register`/`handleSubmit` and inline validation
  rules; shared rules live in [validators.ts](src/react/utils/validators.ts).
  `yup`/`@hookform/resolvers` are still installed but no longer used anywhere.
  - Pass `register()` last in the JSX and **don't** also set `name` — `register`
    supplies it, and a duplicate is a TS error. `LabeledInput` derives its id from it.
  - Invoice line items are **not** a hook-form field array; they're local state in
    [InvoiceCreate.tsx](src/react/pages/InvoiceCreate.tsx) held as strings and coerced
    when totals are computed, so partial input ("1.", "") doesn't fight the cursor.
- **Types:** domain and component-prop types are still ambient globals in
  [types.d.ts](types.d.ts) (e.g. `LineItem`). Prefer proper modules over new globals —
  the UI primitives all declare their props locally. `InputProps`/`LabeledInputProps`
  in `types.d.ts` are leftovers no component reads any more.
- **Formatting:** Prettier — 2-space indent, semicolons, **double quotes**, es5 trailing
  commas, always-parenthesized arrow params, `jsxBracketSameLine: true`. TypeScript is
  `strict` with `noUnusedLocals`/`noUnusedParameters`, so remove dead bindings.
- **Currency/locale:** format money with `toLocaleString("en-IN")` and the `₹` symbol,
  matching existing code.

## Auth & state (current)

- Auth is a **static placeholder**: [SignIn.tsx](src/react/pages/SignIn.tsx) sets
  `localStorage.isUserLoggedIn = "true"` and navigates. Logout lives in two places —
  the sidebar user card and Settings → Account — and both just clear the flag.
- [ProtectedRoute.tsx](src/react/router/ProtectedRoute.tsx) only checks that flag.
  Role-based access is **planned** — `allowedRole` is already passed in the routes and
  the check is commented out. When implementing RBAC, evolve this into a
  permission-gated check (see design.md §2). No global state library is in use yet.

## Gotchas

- **README.md is stale** — it still describes the original "Electron Resource Monitor"
  tutorial, not BillSane. Don't trust it; trust design.md and the code.
- **`src/invoice-templates/style.css` is dead** — 715 lines that nothing imports.
  `Invoice.tsx` is styled with Tailwind and reads business details from
  `businessConfig`; invoice numbers come back from the main process on save.
- **Commented-out code** is common (mid-refactor). Don't assume it's the intended path;
  confirm which branch is live before extending it.
- **Sign-up is not implemented.** [SignUp.tsx](src/react/pages/SignUp.tsx) is an honest
  placeholder that routes back to sign-in, not a working form.
- **BillSane is light-only by design.** There is no dark mode and no theme picker —
  `:root` pins `color-scheme: light` so the OS setting can't recolour native controls.
  Don't add `dark:` variants or a theme toggle. (The navy sidebar/auth panel are brand
  chrome via the `shell` tokens, not a dark theme.)
- **Settings → Appearance is mostly presentational.** Its one real preference is the
  default sidebar state, which applies on next launch because `Home` reads it at mount;
  the rest is the brand palette reference.

## Where things go

| Task | Where |
|------|-------|
| Add a page/route | `src/react/pages/` + register in `router/Router.tsx` |
| Add a Settings tab | `src/react/pages/Settings/` + nested route + `Settings.tsx` nav |
| Reusable UI primitive | `src/react/components/ui/elements/` |
| Register a screen in nav/search | `src/react/router/navigation.ts` |
| Global keyboard shortcut | `src/react/pages/Home.tsx` (shell-level `keydown`) |
| Toast / transient feedback | `useToast()` from `ui/feedback/toastContext` |
| Page frame / shell | `src/react/components/core/layout/` |
| Brand colors / tokens | `tailwind.config.js` |
| Global/print CSS | `src/react/index.css` |
| Electron main / IPC | `src/electron/` (+ types in `types.d.ts`) |
| Print/invoice output | `src/invoice-templates/` |

## Working agreements

- Match the surrounding code's style and idioms; reuse existing primitives and tokens.
- Keep the Electron/renderer boundary clean; expose new capabilities through the typed
  preload bridge, not by loosening `contextBridge`.
- Only commit or push when asked. Don't invent tests or claim green runs that didn't
  happen.
