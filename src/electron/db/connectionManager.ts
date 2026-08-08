import { DataSource } from "typeorm";
import { createDataSource, DataSourceConfig } from "./dataSourceFactory.js";
import { getDecryptedConfig } from "./configStore.js";
import type { DbOperationResult, DbStatus } from "./types.js";

let activeDataSource: DataSource | null = null;
let status: DbStatus = { state: "not-configured" };

export function getDbStatus(): DbStatus {
  return status;
}

export function getDataSource(): DataSource | null {
  return activeDataSource;
}

// Never awaited from main.ts's app.on("ready") - an unreachable Postgres/MySQL
// host must not hang the whole app launch behind a TCP connect timeout.
export async function initializeDatabase(): Promise<void> {
  status = { state: "connecting" };
  try {
    const config = await getDecryptedConfig();
    const dataSource = createDataSource(config);
    await dataSource.initialize();
    // TypeORM tracks applied migrations in its own table and no-ops when nothing
    // is pending, so this is safe to run unconditionally on every startup.
    await dataSource.runMigrations();

    if (activeDataSource) {
      await activeDataSource.destroy().catch(() => undefined);
    }
    activeDataSource = dataSource;
    status = { state: "connected", backend: config.backend };
  } catch (err) {
    activeDataSource = null;
    status = { state: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

export async function testConnection(config: DataSourceConfig): Promise<DbOperationResult> {
  const candidate = createDataSource(config);
  try {
    await candidate.initialize();
    await candidate.destroy();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
