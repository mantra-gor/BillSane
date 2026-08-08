export type DbBackend = "local" | "postgres" | "mysql";

export interface DbConnectionFields {
  host: string;
  port: number;
  username: string;
  database: string;
  useSsl: boolean;
}

export interface DbConfigInput {
  backend: DbBackend;
  postgres?: DbConnectionFields & { password?: string };
  mysql?: DbConnectionFields & { password?: string };
}

export interface DbConfigRedacted {
  backend: DbBackend;
  postgres?: DbConnectionFields & { hasStoredPassword: boolean };
  mysql?: DbConnectionFields & { hasStoredPassword: boolean };
}

export type DbOperationResult = { ok: true } | { ok: false; error: string };

export interface DbStatus {
  state: "connecting" | "connected" | "error" | "not-configured";
  backend?: DbBackend;
  error?: string;
}
