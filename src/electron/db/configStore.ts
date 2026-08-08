import { safeStorage } from "electron";
import fs from "fs";
import path from "path";
import { getUserDataPath } from "../pathResolver.js";
import type { DbBackend, DbConfigInput, DbConfigRedacted, DbConnectionFields } from "./types.js";

const CONFIG_FILE_NAME = "db-config.json";

interface StoredConnectionFields extends DbConnectionFields {
  encryptedPassword?: string; // base64-encoded safeStorage output
}

interface StoredConfig {
  backend: DbBackend;
  postgres?: StoredConnectionFields;
  mysql?: StoredConnectionFields;
}

export interface DecryptedConnectionFields extends DbConnectionFields {
  password?: string;
}

export interface DecryptedDbConfig {
  backend: DbBackend;
  postgres?: DecryptedConnectionFields;
  mysql?: DecryptedConnectionFields;
}

function getConfigPath(): string {
  return path.join(getUserDataPath(), CONFIG_FILE_NAME);
}

function readStoredConfig(): StoredConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return { backend: "local" };
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return { backend: "local" };
  }
}

function writeStoredConfig(config: StoredConfig): void {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}

function redact(
  fields?: StoredConnectionFields
): (DbConnectionFields & { hasStoredPassword: boolean }) | undefined {
  if (!fields) return undefined;
  const { encryptedPassword, ...rest } = fields;
  return { ...rest, hasStoredPassword: !!encryptedPassword };
}

export function getDbConfig(): DbConfigRedacted {
  const stored = readStoredConfig();
  return {
    backend: stored.backend,
    postgres: redact(stored.postgres),
    mysql: redact(stored.mysql),
  };
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
  input: (DbConnectionFields & { password?: string }) | undefined,
  existing: StoredConnectionFields | undefined
): Promise<StoredConnectionFields | undefined> {
  if (!input) return undefined;
  const { password, ...fields } = input;
  // Blank password on save means "keep whatever is already stored" -
  // the renderer never has the real secret to send back (see getDbConfig).
  const encryptedPassword = password ? await encryptPassword(password) : existing?.encryptedPassword;
  return { ...fields, encryptedPassword };
}

export async function saveDbConfig(input: DbConfigInput): Promise<void> {
  const existing = readStoredConfig();
  const next: StoredConfig = {
    backend: input.backend,
    postgres: await buildStoredFields(input.postgres, existing.postgres),
    mysql: await buildStoredFields(input.mysql, existing.mysql),
  };
  writeStoredConfig(next);
}

export async function getDecryptedConfig(): Promise<DecryptedDbConfig> {
  const stored = readStoredConfig();
  const decrypt = async (
    fields?: StoredConnectionFields
  ): Promise<DecryptedConnectionFields | undefined> => {
    if (!fields) return undefined;
    const { encryptedPassword, ...rest } = fields;
    return { ...rest, password: await decryptPassword(encryptedPassword) };
  };
  return {
    backend: stored.backend,
    postgres: await decrypt(stored.postgres),
    mysql: await decrypt(stored.mysql),
  };
}
