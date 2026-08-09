# SQLite DB Backup to S3 (SaaS)

## Context

BillSane is moving from a purely local desktop app toward a SaaS offering, and
needs automated, off-machine backups of each customer's local `billsane.db` so
a lost/corrupted machine doesn't mean lost invoices. The backup target is
BillSane's own S3 bucket (not the end user's personal cloud storage), with a
backend service issuing presigned URLs so the desktop client never holds raw
AWS credentials. Restore is manual and explicit: pick a backup (from a
server-side list, or a file already downloaded to disk) and the app replaces
its local database with it.

This repo (`billsane-client`) is the Electron desktop client only — there is
no backend anywhere in the codebase today. This plan covers:
1. The full client-side feature (scheduling, snapshotting, upload/restore UI,
   activation).
2. A documented API contract the separate backend must implement. Building
   that backend is explicitly out of scope here.

Decisions already made (via user Q&A) that shape this plan:
- **Auth to backend**: a one-time **activation key** pasted into Settings,
  stored locally, sent as a bearer token on every backup API call. No
  per-user Google-style OAuth — that path was dropped when the target moved
  from personal Google Drive to BillSane's own S3.
- **Retention & at-rest encryption**: owned by the backend/S3 infra, not the
  client. The client just uploads on schedule; how long backups are kept and
  how they're encrypted at rest is a server-side policy decision.
- **Scheduling**: catch-up-on-launch only. No system tray / background
  process / autostart. If the app isn't opened for a while, the next launch
  just runs the overdue backup then.

## How a safe snapshot is taken

`billsane.db` is a live, open SQLite (WAL mode) file — naively `fs.copyFile`-ing
it risks grabbing an inconsistent state mid-write. `better-sqlite3` (already a
dependency, underlying TypeORM's driver) ships a native online-backup API for
exactly this: `Database.prototype.backup(destinationPath)`, confirmed present
at `node_modules/better-sqlite3/lib/methods/backup.js`. TypeORM exposes the
raw driver instance as `dataSource.driver.databaseConnection`
(`node_modules/typeorm/driver/better-sqlite3/BetterSqlite3Driver.js:92`), so a
snapshot is:

```ts
const raw = (getDataSource()!.driver as any).databaseConnection; // better-sqlite3 Database
await raw.backup(snapshotPath);
```

No need to close/reopen the DataSource for backup — this API is safe to run
against a live, concurrently-written connection. (Restore is different: that
*does* need the DataSource torn down and reopened — see below.)

## Client-side pieces

### 1. Backup config storage — `src/electron/db/backupConfigStore.ts`

New file, mirroring `configStore.ts`'s exact pattern (`db-config.json` →
`backup-config.json`, same `getUserDataPath()` + `safeStorage` approach):

```ts
interface StoredBackupConfig {
  frequency: "daily" | "every2days" | "weekly";
  lastBackupAt?: string; // ISO
  lastBackupStatus?: "success" | "error";
  lastBackupError?: string;
  encryptedActivationKey?: string; // safeStorage, base64 — same shape as encryptedPassword
}
```

- `getBackupConfig()` → redacted (`hasActivationKey: boolean` instead of the
  key, exactly like `redact()` in `configStore.ts:68-74`).
- `saveBackupConfig(input)` — blank activation key on save = keep existing
  (same "blank means keep stored secret" rule as `buildStoredFields`,
  `configStore.ts:95-105`).
- `getDecryptedBackupConfig()` — main-process-only, used when actually
  calling the backend.
- `recordBackupResult(status, error?)` — updates `lastBackupAt` /
  `lastBackupStatus` after each run.

### 2. Backend client — `src/electron/domain/backupApi.ts`

Thin `fetch`-based wrapper (Node 18+/Electron has global `fetch`; no new
dependency needed — matches the codebase's preference for in-house code over
libraries, e.g. the hand-rolled CSV reader). Base URL is a build-time
constant (env var, e.g. `BILLSANE_API_URL`, with a dev default).

```ts
async function activate(key: string): Promise<{ ok: true; tenantName: string } | { ok: false; error: string }>
async function requestUploadUrl(key: string, fileName: string, sizeBytes: number): Promise<{ ok: true; uploadUrl: string; backupId: string } | { ok: false; error: string }>
async function confirmUpload(key: string, backupId: string): Promise<DbOperationResult>
async function listBackups(key: string): Promise<{ ok: true; backups: BackupSummary[] } | { ok: false; error: string }>
async function requestDownloadUrl(key: string, backupId: string): Promise<{ ok: true; downloadUrl: string } | { ok: false; error: string }>
```

Every call sends `Authorization: Bearer <activationKey>`. All failures
(network, 4xx/5xx) collapse to `{ ok: false, error }` — same "return, don't
throw" convention as `testCloudConnection` / `saveDbConfig`.

### 3. Snapshot + upload orchestration — `src/electron/domain/backup.ts`

```ts
export async function runBackup(): Promise<DbOperationResult> {
  const config = await getDecryptedBackupConfig();
  if (!config.activationKey) return { ok: false, error: "Backup isn't activated yet." };

  const dataSource = getDataSource();
  if (!dataSource) return { ok: false, error: "Database isn't connected." };

  const fileName = `billsane-${Date.now()}.db`;
  const snapshotPath = path.join(getUserDataPath(), "backup-tmp", fileName);
  await fs.promises.mkdir(path.dirname(snapshotPath), { recursive: true });
  await (dataSource.driver as any).databaseConnection.backup(snapshotPath);

  try {
    const stat = await fs.promises.stat(snapshotPath);
    const urlResult = await requestUploadUrl(config.activationKey, fileName, stat.size);
    if (!urlResult.ok) return urlResult;

    const bytes = await fs.promises.readFile(snapshotPath);
    const putResponse = await fetch(urlResult.uploadUrl, { method: "PUT", body: bytes });
    if (!putResponse.ok) return { ok: false, error: `Upload failed (${putResponse.status})` };

    await confirmUpload(config.activationKey, urlResult.backupId);
    await recordBackupResult("success");
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordBackupResult("error", error);
    return { ok: false, error };
  } finally {
    await fs.promises.unlink(snapshotPath).catch(() => undefined);
  }
}
```

`export function isBackupDue(config): boolean` — pure function comparing
`lastBackupAt` + the frequency's interval (1 / 2 / 7 days) against `Date.now()`.

### 4. Restore — extends `connectionManager.ts`

Restoring means replacing the live SQLite file, so it needs the
close → replace → reopen sequence the DB layer doesn't currently have a name
for. Add to `connectionManager.ts`:

```ts
export async function closeDatabase(): Promise<void> {
  if (activeDataSource) {
    await activeDataSource.destroy().catch(() => undefined);
    activeDataSource = null;
  }
  status = { state: "not-configured" };
}
```

Restore flow (`domain/backup.ts`):
1. Get the incoming file's bytes — either from a presigned download URL
   (cloud-picked restore) or a local path (file-picker restore, see UI below).
2. Sanity-check it's a BillSane SQLite file before touching anything live:
   open it read-only via a throwaway `better-sqlite3` instance and confirm it
   has the `migrations` table TypeORM stamps every DB with (cheap, avoids
   clobbering the working DB with garbage).
3. Safety copy: back up the *current* `billsane.db` to
   `backups/pre-restore-<timestamp>.db` in userData, in case the incoming
   file turns out to be bad.
4. `closeDatabase()`, `fs.copyFile(incoming, billsane.db path)`,
   `initializeDatabase()` again (this already re-runs migrations
   unconditionally per `connectionManager.ts:44-46`, which safely upgrades an
   older-schema backup to the current schema).
5. Return `DbOperationResult`; the renderer should prompt the user to
   restart/reload after a successful restore since every IPC caller's
   in-flight assumptions about the DataSource just changed.

### 5. Permission

Add to `PERMISSION_GROUPS` in `src/electron/domain/permissions.ts`, in the
existing "Settings" group, next to `settings:database`:

```ts
{
  key: "settings:backup",
  label: "Manage backups",
  description: "Cloud backup schedule, activation, and restoring the database",
},
```

### 6. IPC — new `src/electron/ipc/registerBackupIpcHandlers.ts`

Same shape as `registerDbIpcHandlers.ts`, gated on `["settings:backup"]` via
`ipcHandleGuarded`, called from `main.ts` alongside the other `register*`
calls:

- `backup:getConfig` → `getBackupConfig()`
- `backup:saveConfig` → `saveBackupConfig(input)`
- `backup:activate` (input: raw key) → validates via `backupApi.activate`,
  saves on success
- `backup:runNow` → `runBackup()`
- `backup:listRemote` → `backupApi.listBackups(...)`
- `backup:restoreFromRemote` (input: backupId) → download-url + restore flow
- `backup:restoreFromFile` (input: file path from a native picker) → restore
  flow using local bytes
- `backup:getStatus` → last run time/status (`ipcHandleAuthenticated`, like
  `db:getStatus` — any signed-in user can see backup health, not just the
  owner)

Add `EventPayloadMapping` entries in `types.d.ts` for each channel (mirroring
the `product:importPreview` / `product:import` shape at `types.d.ts:161-168`)
and mirror methods onto `Window.electron` in `preload.cts`, following the
exact `getDbConfig`/`saveDbConfig` pattern at `preload.cts:35-38`.

### 7. Scheduling — `main.ts`

No new package (confirmed nothing like `node-cron`/`node-schedule` is
installed, and none is needed for "check once per launch + a while-open
timer"). In `main.ts`, after `initializeDatabase()`:

```ts
app.on("ready", () => {
  registerAuthIpcHandlers();
  registerDbIpcHandlers();
  registerDomainIpcHandlers();
  registerBackupIpcHandlers();
  initializeDatabase();
  scheduleBackupCheck(); // new: checks isBackupDue() now, then setInterval every hour
  // ...window creation unchanged
});
```

`scheduleBackupCheck()` (new, small, in `domain/backup.ts` or its own
`backupScheduler.ts`): awaits `whenDatabaseReady()`, runs `runBackup()` once
if due, then `setInterval(checkAndRun, ONE_HOUR_MS)` for the rest of the
session. Hourly granularity is enough for day/2-day/week frequencies and
avoids needing a precise scheduler library.

### 8. Restore file picker

No `dialog.showOpenDialog` exists yet in main process (only `showSaveDialog`,
for the CSV import template at
`registerDomainIpcHandlers.ts:423-446`). Add one for restore:

```ts
ipcHandleGuarded("backup:pickRestoreFile", ["settings:backup"], async () => {
  const parent = BrowserWindow.getFocusedWindow();
  const result = parent
    ? await dialog.showOpenDialog(parent, { filters: [{ name: "BillSane Backup", extensions: ["db"] }], properties: ["openFile"] })
    : await dialog.showOpenDialog({ filters: [{ name: "BillSane Backup", extensions: ["db"] }], properties: ["openFile"] });
  if (result.canceled || !result.filePaths[0]) return { ok: true, canceled: true, filePath: null };
  return { ok: true, canceled: false, filePath: result.filePaths[0] };
});
```

This returns a path, not file contents (unlike the CSV import's
renderer-reads-the-file approach) — appropriate here since the file can be
tens of MB and main process already has full filesystem access; no reason to
round-trip bytes through IPC.

### 9. Settings UI — `src/react/pages/Settings/Backup.tsx`

New tab, modeled directly on `Settings/Database.tsx`'s structure (loading via
`useEffect` + `SkeletonText`, `react-hook-form` for the frequency field, a
`TestState`-style discriminated union for "Back up now", toasts on
success/error via `useToast()`). Sections:

1. **Activation** — if no key stored: a single `LabeledInput` + "Activate"
   button calling `backup:activate`; on success shows "Connected as
   `{tenantName}`" with a success banner (same visual language as the
   hybrid-mode info banner at `Database.tsx:217-228`). If already activated,
   show connected status + a "Disconnect" action (clears the stored key).
2. **Schedule** — radio-card group (reuse the exact pattern at
   `Database.tsx:177-212`) for Daily / Every 2 days / Weekly, plus last
   backup time/status and a "Back up now" button.
3. **Restore** — "Restore from cloud" (fetches `backup:listRemote`, renders a
   simple list/table with timestamps, a "Restore" button per row) and
   "Restore from a file" (triggers `backup:pickRestoreFile` then
   `backup:restoreFromFile`). Both restore actions go through a confirmation
   `Modal` (existing primitive) — this overwrites the live database, it needs
   an explicit "Yes, restore" step, not a single click.

Register the route in `Router.tsx`'s settings children
(`path: "backup"`, `<ProtectedRoute permission={["settings:backup"]}
element={<Backup />} />`, next to the `database` entry at
`Router.tsx:139-143`) and in `SETTINGS_TABS` in `navigation.ts` (next to the
`Database` entry at `navigation.ts:163-170`) — also **remove `"backup"` from
the Database entry's `keywords`** at `navigation.ts:169` now that it's a real
tab of its own, so search doesn't send people to the wrong screen.

## Backend API contract (for the separate service — not built here)

All endpoints require `Authorization: Bearer <activationKey>`.

| Endpoint | Purpose |
|---|---|
| `POST /v1/backup/activate` | Validate the key. Returns `{ tenantId, tenantName }` or 401. |
| `POST /v1/backup/upload-url` | Body `{ fileName, sizeBytes }`. Returns a presigned S3 `PUT` URL scoped to that tenant's prefix + a `backupId`. |
| `POST /v1/backup/confirm` | Body `{ backupId }`. Marks the upload complete; server-side is where retention pruning happens. |
| `GET /v1/backup/list` | Returns `{ id, fileName, sizeBytes, createdAt }[]` for that tenant, newest first. |
| `GET /v1/backup/download-url?backupId=` | Returns a presigned S3 `GET` URL for that backup. |

The client never sees an S3 credential — only short-lived presigned URLs.
Retention policy (how many backups to keep, at what plan tier) and at-rest
encryption (S3 SSE) are entirely server-side concerns.

## Verification

- `npm run build` and `npm run lint` clean.
- Manual run via `npm run dev`: activate against a mock/local backend (a
  trivial script or `json-server`-style stub returning fixed presigned URLs
  is enough to exercise the client without the real backend existing),
  confirm a scheduled/"Back up now" backup produces a valid snapshot file
  (open it with `sqlite3` CLI or better-sqlite3 to confirm it's a readable,
  intact DB), then restore it into a fresh userData dir and confirm the app
  reads it correctly (data present, migrations re-run cleanly).
- Confirm `settings:backup` permission gates the new tab/nav entry and IPC
  channels the same way `settings:database` does for an unprivileged role.
