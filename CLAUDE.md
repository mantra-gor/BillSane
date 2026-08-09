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

### Bulk import (CSV)

`/inventory` → **Import** (⌘I / Ctrl+I) loads a whole catalog or stock count from a
spreadsheet. Engine: [domain/productImport.ts](src/electron/domain/productImport.ts) on
top of the in-house RFC 4180 reader in [domain/csv.ts](src/electron/domain/csv.ts); UI:
[ImportInventoryModal.tsx](src/react/components/inventory/ImportInventoryModal.tsx).
See design.md §7.6.1 for the reasoning. The invariants:

- **Preview then commit, and the commit re-parses.** `product:importPreview` reports
  what would happen; `product:import` re-reads the *same CSV text* inside one
  transaction. Don't "optimise" this into shipping the previewed rows back — the point
  is that the renderer can't send anything the engine didn't decide for itself.
- **Blank cell = leave the current value alone.** Absent from `ProductImportValues`
  means the file said nothing. Never coerce a blank to `null`/`0` on an update, or a
  stock-count sheet silently erases every price.
- **Only `name` is required**, and headers are aliased hard (`foldHeader` + the
  `COLUMNS` table). Adding an alias is usually the right fix for "it didn't read my
  file"; adding a required column never is.
- **Rows fail individually.** `readRow` collects *all* complaints and the row carries the
  file's own line number. File-level problems (no name column, empty, too many rows)
  throw and surface as one sentence.
- `IMPORT_TEMPLATE_CSV` is the only copy of the example file;
  [examples/inventory-import-example.csv](examples/inventory-import-example.csv) is
  regenerated from it (see [examples/README.md](examples/README.md)).
- The three IPC handlers return result objects rather than throwing, because an
  `ipcInvoke` rejection reaches the renderer wrapped in "Error invoking remote method …"
  and these messages are meant to be read.

## Auth & RBAC

Accounts are real: `User` + `Role` + `RolePermission`
([entities/](src/electron/db/entities/), migration
[AuthRbac](src/electron/db/migrations/1785000000000-AuthRbac.ts)). The rules that
matter before you touch any of it:

- **Enforcement lives in the main process.** `ipcHandleGuarded` /
  `ipcHandleAuthenticated` ([ipc/guard.ts](src/electron/ipc/guard.ts)) wrap *every*
  domain handler and check against the session in
  [domain/session.ts](src/electron/domain/session.ts). Hiding a route or a button is
  presentation — `window.electron.deleteInvoice(id)` is one console line away. A new
  IPC channel without a guard is a hole; add it in the same commit as the handler.
  Several permissions on one guard means **any** of them passes.
- **Roles are data; permissions are a closed code catalog.**
  [domain/permissions.ts](src/electron/domain/permissions.ts) is the only place a
  permission key exists. Roles are created by the owner at runtime, so adding a
  *role* is never a code change; adding a *permission* always is (catalog + the guard
  that checks it).
- **The system role holds the catalog, not stored grants.** `Role.isSystem` resolves
  to `ALL_PERMISSIONS` at read time, so a permission added later reaches the owner
  with no migration. It can't be renamed, re-scoped or deleted.
- **The lockout guard is not optional.** `assertAdminRemains`
  ([domain/users.ts](src/electron/domain/users.ts)) runs before any change that could
  remove the last *active* user holding `users:manage` — suspend, delete, demote, or
  stripping the permission off the last role that grants it. Losing it is
  unrecoverable without editing the database by hand.
- **There is no sign-up.** First launch (zero users) routes to `/setup`, which creates
  one Administrator and is then unreachable; everyone else is added in
  Settings → Users. Nothing ships a default credential.
- **Passwords** are scrypt via node's stdlib
  ([domain/password.ts](src/electron/domain/password.ts)) — deliberately *not*
  bcrypt/argon2, which are native modules needing an ABI rebuild per platform. The
  hash never crosses the bridge.
- **Sessions** live in main-process memory. "Keep me signed in" writes the user id
  through `safeStorage`; the role and active flag are always re-read from the
  database on restore, never trusted from the file. Any user/role mutation calls
  `refreshCurrentSession`, so revoking access takes effect immediately rather than at
  next launch.
- **`app_user`, not `user`** — `user` is a reserved word in postgres, and hybrid mode
  runs this schema there.
- Renderer side: `useAuth()` ([auth/authContext.ts](src/react/auth/authContext.ts))
  gives `can(...permissions)` with the same any-of rule. Screens declare their
  permission **once**, in [navigation.ts](src/react/router/navigation.ts) — the
  sidebar, palette, Settings rail and `ProtectedRoute` all read it — but the route
  still has to pass it to `ProtectedRoute` in `Router.tsx`.

> ⚠️ TypeORM trap, already paid for once: `User.role` is eager, so an entity arrives
> holding its old `Role` object. Setting `user.roleId` alone **silently does nothing**
> on save — the relation wins. Set both (`updateUser` shows the pattern).

## Renderer layout

```
src/react/
├── main.tsx          React root + HashRouter (HashRouter is required for file:// prod)
├── App.tsx           ToastProvider → AuthProvider → Router (+ zoom suppression)
├── auth/
│   ├── AuthProvider.tsx  Boots the session; holds the app back until it settles
│   └── authContext.ts    useAuth() → status / user / permissions / can()
├── router/
│   ├── Router.tsx        Central route config (useRoutes) — add routes HERE
│   ├── navigation.ts     NAV_GROUPS / SETTINGS_TABS + permission filtering
│   ├── ProtectedRoute.tsx Signed-in + permission gate (and the forced-password gate)
│   └── AuthRoute.tsx     The signed-out side: /sign-in vs /setup vs already in
├── hooks/usePlatform.ts   MOD_KEY / hasModifier — ⌘ on macOS, Ctrl elsewhere
├── pages/            One component per route (Dashboard, InvoiceCreate, Settings…)
│   ├── Home.tsx      The authenticated shell: Sidebar + Topbar + <Outlet/> + hotkeys
│   ├── Setup.tsx     First run only — creates the one Administrator account
│   ├── ForcePassword.tsx  The gate an admin-issued temporary password lands on
│   └── Settings/     Account, Users, Roles, Business, Database, Appearance
├── components/
│   ├── common/       Sidebar, Topbar, CommandPalette, BrandMark
│   ├── inventory/    ImportInventoryModal (the CSV bulk-import flow)
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
- **Every shortcut works on macOS and Windows.** Never test `metaKey` or `ctrlKey`
  directly — use `hasModifier(e)` from [usePlatform.ts](src/react/hooks/usePlatform.ts),
  which resolves to ⌘ on macOS and Ctrl everywhere else, and render the hint with
  `MOD_KEY` inside a `<kbd className="kbd">`. Current chords: ⌘K palette, ⌘B sidebar,
  ⌘N new invoice, ⌘1–9 nav (all in `Home.tsx`), ⌘I import on `/inventory`, ⌘↵ to commit
  an import.
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

## State

No global state library is in use. The session is the one piece of app-wide state, and
it lives in React context ([auth/](src/react/auth/)) over a main-process source of
truth — see **Auth & RBAC** above. Everything else is page-local state over the
`utils/*Store.ts` IPC wrappers.

## Gotchas

- **README.md is stale** — it still describes the original "Electron Resource Monitor"
  tutorial, not BillSane. Don't trust it; trust design.md and the code.
- **`src/invoice-templates/style.css` is dead** — 715 lines that nothing imports.
  `Invoice.tsx` is styled with Tailwind and reads business details from
  `businessConfig`; invoice numbers come back from the main process on save.
- **Commented-out code** is common (mid-refactor). Don't assume it's the intended path;
  confirm which branch is live before extending it.
- **There is no sign-up, by design** — the admin creates users. `SignUp.tsx` and
  `utils/userProfile.ts` (the localStorage profile) are **gone**; the profile lives on
  the `app_user` row and reaches the UI through `useAuth().user`.
- **`ELECTRON_RUN_AS_NODE=1` is set in this shell's environment.** It silently turns
  `npx electron` into plain node — handy for scripts against the database, confusing
  when you meant to launch the app (`npx electron --version` prints the *node*
  version). Use `env -u ELECTRON_RUN_AS_NODE` to actually run Electron.
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
| Add a page/route | `src/react/pages/` + register in `router/Router.tsx` (with its permission) |
| Add a Settings tab | `src/react/pages/Settings/` + nested route + `navigation.ts` |
| Add a permission | `src/electron/domain/permissions.ts` + the guard that checks it |
| Gate an IPC handler | `ipcHandleGuarded` from `src/electron/ipc/guard.ts` |
| Auth / users / roles | `src/electron/domain/{session,users,roles}.ts` |
| Reusable UI primitive | `src/react/components/ui/elements/` |
| Register a screen in nav/search | `src/react/router/navigation.ts` |
| Global keyboard shortcut | `src/react/pages/Home.tsx` (shell-level `keydown`) |
| Page-level shortcut | the page's own `keydown` effect, gated on `hasModifier(e)` |
| CSV parsing / bulk import | `src/electron/domain/csv.ts` + `domain/productImport.ts` |
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
