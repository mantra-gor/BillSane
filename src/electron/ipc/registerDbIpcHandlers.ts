import { ipcHandle } from "../util.js";
import { getDbConfig, getDecryptedConfig, saveDbConfig } from "../db/configStore.js";
import { getDbStatus, testConnection } from "../db/connectionManager.js";
import type { DbConfigInput, DbOperationResult } from "../db/types.js";
import type { DataSourceConfig } from "../db/dataSourceFactory.js";

// The renderer never holds a decrypted password (see configStore.getDbConfig), so a
// "test"/"save" submitted with a blank password field means "use whatever is already
// stored" rather than "clear it" - fall back to the stored secret before connecting.
async function withStoredSecrets(input: DbConfigInput): Promise<DataSourceConfig> {
  const stored = await getDecryptedConfig();
  const merge = (field: "postgres" | "mysql") => {
    const candidate = input[field];
    if (!candidate) return undefined;
    return { ...candidate, password: candidate.password || stored[field]?.password };
  };
  return { backend: input.backend, postgres: merge("postgres"), mysql: merge("mysql") };
}

export function registerDbIpcHandlers(): void {
  ipcHandle("db:getConfig", () => getDbConfig());

  ipcHandle("db:saveConfig", async (input): Promise<DbOperationResult> => {
    try {
      await saveDbConfig(input);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcHandle("db:testConnection", async (input) => {
    const config = await withStoredSecrets(input);
    return testConnection(config);
  });

  ipcHandle("db:getStatus", () => getDbStatus());
}
