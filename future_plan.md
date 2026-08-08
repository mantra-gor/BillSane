# Admin-selectable DB backend (SQLite / PostgreSQL / MySQL)

## Context

BillSane has no persistence today beyond two renderer-only `localStorage` wrappers
(`src/react/utils/businessConfig.ts`, `src/react/utils/invoiceStore.ts`). design.md
already names "persistence layer" as roadmap item #1 and lists "where does data live"
as an open question (§9, §10).

The user decided: the system admin picks the backend from Settings — **Local
(SQLite) / PostgreSQL / MySQL** — unified behind one ORM, so entity code doesn't fork
per backend. This plan covers **Phase 1**: the backend-selection plumbing itself
(pick → test → save → connect), with no business entities yet. **Phase 2** (real
entities, migrations, and rewiring the existing invoice/business-config flows onto
real persistence) is scoped as the deliberate next step once Phase 1 is verified
working — it touches 5 existing files' data flow (sync → async) and deserves its own
checkpoint rather than landing in the same pass as first-time DB wiring.

## Key decisions

- **ORM: TypeORM.** Its `DataSourceOptions.type` switches directly between
  `better-sqlite3` / `postgres` / `mysql` against the *same* `@Entity()`-decorated
  classes — the one-ORM/three-backends mechanism the requirement needs. Requires
  `experimentalDecorators` + `emitDecoratorMetadata` in `src/electron/tsconfig.json`
  (not currently set) and a `reflect-metadata` import at the main-process entry point.
- **Local driver: `better-sqlite3`**, not a pure-JS/WASM sqlite. WASM options
  re-serialize the entire DB to disk on every write instead of real file-backed
  WAL/journal writes — a real data-integrity risk for financial records as invoice
  history grows. `better-sqlite3` is a native Node addon, which has packaging
  consequences (below).
- **DB code lives only in the Electron main process** (`src/electron/db/`) — never
  imported by the renderer, consistent with CLAUDE.md's "no raw Node in the renderer" /
  strict contextBridge boundary. All access goes through `window.electron.*`.
- **Config bootstrap**: before any DataSource can connect, something must already know
  which backend + credentials to use — that config can't live inside the DB it
  describes. Store it as a small JSON file in `app.getPath("userData")`. Postgres/MySQL
  passwords are wrapped with Electron's `safeStorage` (OS-keychain backed) and **never**
  sent back to the renderer in plaintext — the read-side type only exposes
  `hasStoredPassword: boolean`.
- **IPC currently has no way to pass arguments.** `ipcHandle`/`ipcWebContentsSend`
  (`src/electron/util.ts`) and `ipcInvoke`/`ipcOn` (`src/electron/preload.cts`) are all
  zero-arg today, tied to a flat `EventPayloadMapping` (`types.d.ts`) that maps a
  channel name straight to a response type. Confirmed via grep that `ipcHandle` is
  never actually called anywhere yet (the 2 existing channels are dead on the
  main-process side) — so there's no working call site to preserve, just signatures.
  This plan restructures `EventPayloadMapping` to `{ args: [...]; return: ... }` per
  channel and widens all four helpers accordingly. This becomes the standing
  convention for all future domain IPC, not a one-off for this feature.
- **Packaging risk (real — verify, don't assume):** `electron-builder.json` has no
  native-module configuration today (no `asarUnpack`, no `npmRebuild` override) and
  `package.json` has no `postinstall` step. A native addon built against the system
  Node ABI will crash under Electron's own ABI unless rebuilt for it. Mitigation:
  add `"postinstall": "electron-builder install-app-deps"` (electron-builder already
  depends on `@electron/rebuild` internally and exposes this exact hook). Verification
  must include an actual `npm run dist:mac` packaged-app run, not just `npm run dev` —
  docs say modern electron-builder auto-unpacks native `.node` binaries from asar, but
  that needs confirming against this repo, not taken on faith.
- **Changing backend requires an app restart** — no live hot-swap of an active
  DataSource mid-session. Simpler and safer; switching backend is a rare, deliberate
  admin action, not something that needs to be seamless.

## Files — Phase 1

**New `src/electron/db/`:**
- `types.ts` — `DbBackend` (`"local"|"postgres"|"mysql"`), `DbConfigInput`,
  `DbConfigRedacted` (no password field — only `hasStoredPassword`), `DbStatus`.
- `configStore.ts` — `getDbConfig()`/`saveDbConfig()` against
  `<userData>/db-config.json`; secrets via `safeStorage.encryptStringAsync`/
  `decryptStringAsync`. Must only be called from inside IPC handlers (`safeStorage`
  requires `app.isReady()`) — never touched at module-load time.
- `dataSourceFactory.ts` — `buildDataSourceOptions(config)` → TypeORM
  `DataSourceOptions` for whichever backend is active; `createDataSource(config)`.
- `connectionManager.ts` — module-level active DataSource + in-memory `DbStatus`;
  `initializeDatabase()` (called from `main.ts`, **not** awaited before window
  creation — an unreachable Postgres host must not hang app launch),
  `getDataSource()`, `testConnection(candidate)` (initialize+destroy a throwaway
  DataSource; backs both Settings' "Test Connection" button and save-time
  validation).

**New `src/electron/ipc/registerDbIpcHandlers.ts`** — registers `db:getConfig` /
`db:saveConfig` / `db:testConnection` / `db:getStatus` via the widened `ipcHandle`.
Called once from `main.ts`.

**Modified `src/electron/util.ts`, `src/electron/preload.cts`, `types.d.ts`** — the
IPC arg-support rework above. The 2 legacy channels (`statistics`, `getStaticData`)
get `args: []` and keep their exact current call-site signatures — purely additive.

**Modified `src/electron/pathResolver.ts`** — add `getUserDataPath()` wrapping
`app.getPath("userData")`, alongside the existing `getPreloadPath()`/`getUIPath()`.

**Modified `src/electron/tsconfig.json`** — add `experimentalDecorators: true`,
`emitDecoratorMetadata: true`.

**Modified `src/electron/main.ts`** — import `reflect-metadata` first; call
`initializeDatabase()` (fire-and-forget) and register the new DB IPC handlers
alongside the existing window creation.

**New `src/react/utils/dbConfig.ts`** — same `get*`/`save*` call shape as the
existing `businessConfig.ts` convention, IPC-backed instead of localStorage-backed:
`getDbConfig()`, `saveDbConfig()`, `testDbConnection()` (all async).

**New `src/react/pages/Settings/Database.tsx`** — mirrors `Account.tsx`/
`Configurations.tsx` exactly (react-hook-form, `LabeledInput`/`Button`, section
header + card + inline errors + transient "Saved successfully"):
- Backend picker reuses the existing 3-option selectable-button pattern already in
  `InvoiceCreate.tsx`'s payment-type selector (`border-prussian_blue bg-prussian_blue-5`
  active state) rather than introducing new radio controls.
- Host/port/username/password/database-name fields render only when backend ≠ local;
  port defaults 5432 (postgres)/3306 (mysql); include a "Use SSL" checkbox (cheap now,
  painful to retrofit).
- Password field never pre-fills a real secret — placeholder text like "leave blank
  to keep current password," which falls directly out of `DbConfigRedacted` never
  carrying a plaintext password.
- "Test Connection" (`type="button"`, not submit) shows a 3-state result
  (testing/success/error-with-message), not just a boolean.
- On successful save: the standard transient "Saved successfully" plus a persistent
  banner — "Restart BillSane to apply the new database backend."

**Modified `src/react/router/Router.tsx`, `src/react/pages/Settings.tsx`** — add
`{ path: "database", element: <Database /> }` to the Settings `children` array, and
`{ title: "Database", path: "database" }` to `settingsOptions`.

**Modified `package.json`** — add dependencies `typeorm`, `better-sqlite3`, `pg`,
`mysql2`, `reflect-metadata`; add `"postinstall": "electron-builder install-app-deps"`.

## Before writing the real integration: a 5-minute smoke test

Install `typeorm` + `better-sqlite3` together and, in a throwaway script, open a
`DataSource` against a scratch file with one trivial `@Entity()` class
(`synchronize: true`), insert and read back a row. This confirms the specific
installed version pair actually works together before it's wired into the app —
cheap to check directly rather than assume.

## Phase 2 (next, not this pass)

Entities: `Business`, `Customer`, `Invoice`, `LineItem` (matches design.md §6.2;
`User`/`Product`/`Payment`/`Insight` deferred to their own later roadmap items). One
hand-written migration using TypeORM's `QueryRunner` table-builder API rather than raw
SQL strings — that's exactly where sqlite/postgres/mysql syntax diverges
(`AUTOINCREMENT` vs `SERIAL` vs `AUTO_INCREMENT`). `synchronize` stays `false` always,
including for the local/sqlite path.

Then rewire `businessConfig.ts`/`invoiceStore.ts` internals to call the new IPC
(keeping their exported function names/shapes, now `async`) — which ripples into
`Configurations.tsx`, `Invoice.tsx`, `Sales.tsx`, and `InvoiceCreate.tsx`, all of which
currently call these as synchronous localStorage reads and will need loading states.

Gotchas already identified for when this happens:
- Decimal columns come back as `string` from `pg`/`mysql2` but `number` from
  `better-sqlite3` — needs a shared `ValueTransformer` normalizing to `number`.
- `LineItem.taxType` is a free-text string in the real UI already
  (`InvoiceCreate.tsx`'s "Tax Type" column is `<Input type="text">`), not the `number`
  the current ambient `types.d.ts` declares — the entity should type it `string`.
- The base64 company logo (`Configurations.tsx`, capped at 1MB) would exceed MySQL's
  64KB plain-`TEXT` limit — keep it as a file under `userData` rather than a SQL
  column, and keep `BusinessConfig.logo` as the same data-URL string the renderer
  already expects.

## Verification (Phase 1 — no test runner in this repo; manual per CLAUDE.md)

1. `npm install` → confirm the `postinstall` rebuild step completes.
2. `npm run transpile:electron` → confirms the tsconfig decorator flags, new
   `db/`/`ipc/` modules, and widened IPC generics all compile together, for both
   legacy channels and the new `db:*` ones.
3. `npm run dev` → Settings → Database:
   - Pick **Local**, Save, quit and relaunch, confirm the selection persisted.
   - Pick **PostgreSQL** with an unreachable host, hit **Test Connection**, confirm a
     specific failure message (not just the happy path).
   - If a local Postgres/MySQL instance is reachable, point at it, confirm Test
     Connection + Save + persistence across relaunch for both.
4. `npm run dist:mac` → install the packaged app, repeat the Local/SQLite
   save-and-relaunch check **against the packaged build specifically** — this is what
   actually proves or disproves the native-module packaging risk called out above.

## Critical files

- `src/electron/util.ts`, `src/electron/preload.cts`, `types.d.ts` — IPC arg support
- `src/electron/db/dataSourceFactory.ts`, `connectionManager.ts` — new
- `src/react/pages/Settings/Database.tsx` — new
- `src/react/utils/businessConfig.ts`, `src/react/utils/invoiceStore.ts` — the
  existing pattern this feature extends (Phase 1) and later rewires onto IPC (Phase 2)
