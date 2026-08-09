import { DataSource } from "typeorm";
import { createCloudDataSource, createLocalDataSource } from "./dataSourceFactory.js";
import { getDecryptedConfig } from "./configStore.js";
import type { CloudConnectionInput, DbOperationResult, DbStatus } from "./types.js";

let activeDataSource: DataSource | null = null;
let status: DbStatus = { state: "not-configured" };
let readyPromise: Promise<void> = Promise.resolve();

export function getDbStatus(): DbStatus {
  return status;
}

export function getDataSource(): DataSource | null {
  return activeDataSource;
}

/**
 * Resolves once the in-flight `initializeDatabase()` has settled.
 *
 * Launch deliberately doesn't await the database (see main.ts), which leaves a
 * window where the renderer is already asking "am I signed in?" and the file
 * isn't open yet. Auth handlers await this instead of failing that race with
 * "Database is not connected yet" — it settles either way, so a genuinely
 * broken database still surfaces as its own error a line later.
 */
export function whenDatabaseReady(): Promise<void> {
  return readyPromise;
}

// Local SQLite backs both modes, so startup never waits on the network. When the
// hybrid sync engine lands it attaches after this, out of the launch path.
export function initializeDatabase(): Promise<void> {
  readyPromise = connect();
  return readyPromise;
}

async function connect(): Promise<void> {
  status = { state: "connecting" };
  try {
    const { mode } = await getDecryptedConfig();
    const dataSource = createLocalDataSource();
    await dataSource.initialize();
    // TypeORM tracks applied migrations in its own table and no-ops when nothing
    // is pending, so this is safe to run unconditionally on every startup.
    await dataSource.runMigrations();

    if (activeDataSource) {
      await activeDataSource.destroy().catch(() => undefined);
    }
    activeDataSource = dataSource;
    status = { state: "connected", mode };
  } catch (err) {
    activeDataSource = null;
    status = { state: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

export async function testCloudConnection(
  fields: CloudConnectionInput
): Promise<DbOperationResult> {
  const candidate = createCloudDataSource(fields);
  try {
    await candidate.initialize();
    await candidate.destroy();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
