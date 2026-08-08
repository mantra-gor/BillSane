import { DataSource, DataSourceOptions } from "typeorm";
import path from "path";
import { getUserDataPath } from "../pathResolver.js";
import type { DbConnectionFields } from "./types.js";
import type { DecryptedDbConfig } from "./configStore.js";
import { entities } from "./entities/index.js";
import { InitialSchema1784693224000 } from "./migrations/1784693224000-InitialSchema.js";

export type DataSourceConfig = DecryptedDbConfig;

const migrations = [InitialSchema1784693224000];

function requireFields(
  fields: (DbConnectionFields & { password?: string }) | undefined,
  backendLabel: string
): DbConnectionFields & { password?: string } {
  if (!fields) {
    throw new Error(`${backendLabel} connection details are missing.`);
  }
  return fields;
}

export function buildDataSourceOptions(config: DataSourceConfig): DataSourceOptions {
  switch (config.backend) {
    case "local":
      return {
        type: "better-sqlite3",
        database: path.join(getUserDataPath(), "billsane.db"),
        synchronize: false,
        entities,
        migrations,
      };
    case "postgres": {
      const fields = requireFields(config.postgres, "PostgreSQL");
      return {
        type: "postgres",
        host: fields.host,
        port: fields.port,
        username: fields.username,
        password: fields.password,
        database: fields.database,
        ssl: fields.useSsl,
        synchronize: false,
        entities,
        migrations,
      };
    }
    case "mysql": {
      const fields = requireFields(config.mysql, "MySQL");
      return {
        type: "mysql",
        host: fields.host,
        port: fields.port,
        username: fields.username,
        password: fields.password,
        database: fields.database,
        ssl: fields.useSsl ? {} : undefined,
        synchronize: false,
        entities,
        migrations,
      };
    }
    default: {
      const exhaustiveCheck: never = config.backend;
      throw new Error(`Unknown DB backend: ${exhaustiveCheck}`);
    }
  }
}

export function createDataSource(config: DataSourceConfig): DataSource {
  return new DataSource(buildDataSourceOptions(config));
}
