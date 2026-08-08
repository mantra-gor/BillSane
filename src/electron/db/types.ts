// BillSane runs in one of two data modes. Local SQLite is the source of truth in
// BOTH of them - "hybrid" adds a PostgreSQL cloud database that the local file will
// sync with, so the app keeps working offline. The sync engine is not built yet;
// today "hybrid" only stores (and can test) the cloud credentials.
export type DbMode = "offline" | "hybrid";

export interface CloudConnectionFields {
  host: string;
  port: number;
  username: string;
  database: string;
  useSsl: boolean;
}

export type CloudConnectionInput = CloudConnectionFields & { password?: string };

export interface DbConfigInput {
  mode: DbMode;
  cloud?: CloudConnectionInput;
}

export interface DbConfigRedacted {
  mode: DbMode;
  cloud?: CloudConnectionFields & { hasStoredPassword: boolean };
}

export type DbOperationResult = { ok: true } | { ok: false; error: string };

export interface DbStatus {
  state: "connecting" | "connected" | "error" | "not-configured";
  mode?: DbMode;
  error?: string;
}
