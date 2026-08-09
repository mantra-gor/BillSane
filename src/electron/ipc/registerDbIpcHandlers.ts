import { ipcHandleAuthenticated, ipcHandleGuarded } from "./guard.js";
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
  // Host, port and username are infrastructure detail a cashier has no reason
  // to read, and the mode is what the whole business's data depends on.
  ipcHandleGuarded("db:getConfig", ["settings:database"], () => getDbConfig());

  ipcHandleGuarded("db:saveConfig", ["settings:database"], async (input): Promise<DbOperationResult> => {
    try {
      await saveDbConfig(input);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcHandleGuarded("db:testConnection", ["settings:database"], async (input) =>
    testCloudConnection(await withStoredSecret(input))
  );

  // Status is "is the app's data reachable right now", which anyone who has
  // just failed to save something deserves to be able to see.
  ipcHandleAuthenticated("db:getStatus", () => getDbStatus());
}
