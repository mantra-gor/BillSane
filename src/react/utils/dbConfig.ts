export type DbConfigInput = Parameters<Window["electron"]["saveDbConfig"]>[0];
export type DbConfigRedacted = Awaited<ReturnType<Window["electron"]["getDbConfig"]>>;
export type DbOperationResult = Awaited<ReturnType<Window["electron"]["saveDbConfig"]>>;
export type DbStatus = Awaited<ReturnType<Window["electron"]["getDbStatus"]>>;

export function getDbConfig() {
  return window.electron.getDbConfig();
}

export function saveDbConfig(input: DbConfigInput) {
  return window.electron.saveDbConfig(input);
}

export function testDbConnection(input: DbConfigInput) {
  return window.electron.testDbConnection(input);
}

export function getDbStatus() {
  return window.electron.getDbStatus();
}
