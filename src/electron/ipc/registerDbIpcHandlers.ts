import { ipcHandle } from "../util.js";
import { getDbConfig, getDecryptedConfig, saveDbConfig } from "../db/configStore.js";
import { getDbStatus, testCloudConnection } from "../db/connectionManager.js";
import type { CloudConnectionInput, DbOperationResult } from "../db/types.js";

// The renderer never holds a decrypted password (see configStore.getDbConfig), so a
// "test" submitted with a blank password field means "use whatever is already
// stored" rather than "clear it" - fall back to the stored secret before connecting.
async function withStoredSecret(input: CloudConnectionInput): Promise<CloudConnectionInput> {
  if (input.password) return input;
  const stored = await getDecryptedConfig();
  return { ...input, password: stored.cloud?.password };
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

  ipcHandle("db:testConnection", async (input) => testCloudConnection(await withStoredSecret(input)));

  ipcHandle("db:getStatus", () => getDbStatus());
}
