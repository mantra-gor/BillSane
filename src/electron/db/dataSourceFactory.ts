import { DataSource, DataSourceOptions } from "typeorm";
import path from "path";
import { getUserDataPath } from "../pathResolver.js";
import type { CloudConnectionInput } from "./types.js";
import { entities } from "./entities/index.js";
import { InitialSchema1784693224000 } from "./migrations/1784693224000-InitialSchema.js";
import { CustomerEmailIndex1784790000000 } from "./migrations/1784790000000-CustomerEmailIndex.js";
import { ProductCatalog1784900000000 } from "./migrations/1784900000000-ProductCatalog.js";
import { AuthRbac1785000000000 } from "./migrations/1785000000000-AuthRbac.js";

const migrations = [
  InitialSchema1784693224000,
  CustomerEmailIndex1784790000000,
  ProductCatalog1784900000000,
  AuthRbac1785000000000,
];

// The app always reads and writes the local SQLite file, in offline *and* hybrid
// mode - hybrid layers cloud sync on top of it rather than replacing it.
export function buildLocalDataSourceOptions(): DataSourceOptions {
  return {
    type: "better-sqlite3",
    database: path.join(getUserDataPath(), "billsane.db"),
    synchronize: false,
    entities,
    migrations,
  };
}

export function buildCloudDataSourceOptions(fields: CloudConnectionInput): DataSourceOptions {
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

export function createLocalDataSource(): DataSource {
  return new DataSource(buildLocalDataSourceOptions());
}

export function createCloudDataSource(fields: CloudConnectionInput): DataSource {
  return new DataSource(buildCloudDataSourceOptions(fields));
}
