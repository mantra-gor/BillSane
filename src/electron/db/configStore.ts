import { safeStorage } from "electron";
import fs from "fs";
import path from "path";
import { getUserDataPath } from "../pathResolver.js";
import type {
  CloudConnectionFields,
  CloudConnectionInput,
  DbConfigInput,
  DbConfigRedacted,
  DbMode,
} from "./types.js";

const CONFIG_FILE_NAME = "db-config.json";

interface StoredCloudFields extends CloudConnectionFields {
  encryptedPassword?: string; // base64-encoded safeStorage output
}

interface StoredConfig {
  mode: DbMode;
  cloud?: StoredCloudFields;
}

export interface DecryptedCloudFields extends CloudConnectionFields {
  password?: string;
}

export interface DecryptedDbConfig {
  mode: DbMode;
  cloud?: DecryptedCloudFields;
}

function getConfigPath(): string {
  return path.join(getUserDataPath(), CONFIG_FILE_NAME);
}

// Config files written before the offline/hybrid split stored a three-way
// `backend` ("local" | "postgres" | "mysql") plus per-engine credentials.
// Postgres carries over as the cloud half of hybrid; everything else is offline.
function migrateLegacy(raw: Record<string, unknown>): StoredConfig | null {
  if (!("backend" in raw)) return null;
  const legacyPostgres = raw.postgres as StoredCloudFields | undefined;
  if (raw.backend === "postgres" && legacyPostgres) {
    return { mode: "hybrid", cloud: legacyPostgres };
  }
  return { mode: "offline", cloud: legacyPostgres };
}

function readStoredConfig(): StoredConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return { mode: "offline" };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return migrateLegacy(raw) ?? raw;
  } catch {
    return { mode: "offline" };
  }
}

function writeStoredConfig(config: StoredConfig): void {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}

function redact(
  fields?: StoredCloudFields
): (CloudConnectionFields & { hasStoredPassword: boolean }) | undefined {
  if (!fields) return undefined;
  const { encryptedPassword, ...rest } = fields;
  return { ...rest, hasStoredPassword: !!encryptedPassword };
}

export function getDbConfig(): DbConfigRedacted {
  const stored = readStoredConfig();
  return { mode: stored.mode, cloud: redact(stored.cloud) };
}

async function encryptPassword(password: string): Promise<string> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS-level secret storage is not available on this machine.");
  }
  const buffer = await safeStorage.encryptStringAsync(password);
  return buffer.toString("base64");
}

async function decryptPassword(encryptedPassword?: string): Promise<string | undefined> {
  if (!encryptedPassword) return undefined;
  const { result } = await safeStorage.decryptStringAsync(Buffer.from(encryptedPassword, "base64"));
  return result;
}

async function buildStoredFields(
  input: CloudConnectionInput | undefined,
  existing: StoredCloudFields | undefined
): Promise<StoredCloudFields | undefined> {
  if (!input) return undefined;
  const { password, ...fields } = input;
  // Blank password on save means "keep whatever is already stored" -
  // the renderer never has the real secret to send back (see getDbConfig).
  const encryptedPassword = password ? await encryptPassword(password) : existing?.encryptedPassword;
  return { ...fields, encryptedPassword };
}

export async function saveDbConfig(input: DbConfigInput): Promise<void> {
  const existing = readStoredConfig();
  writeStoredConfig({
    mode: input.mode,
    cloud: await buildStoredFields(input.cloud, existing.cloud),
  });
}

export async function getDecryptedConfig(): Promise<DecryptedDbConfig> {
  const stored = readStoredConfig();
  if (!stored.cloud) return { mode: stored.mode };
  const { encryptedPassword, ...rest } = stored.cloud;
  return {
    mode: stored.mode,
    cloud: { ...rest, password: await decryptPassword(encryptedPassword) },
  };
}
