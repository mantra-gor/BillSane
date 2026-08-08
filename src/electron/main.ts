import "reflect-metadata";
import { app, BrowserWindow } from "electron";
import path from "path";
import { isDev } from "./util.js";
import { getPreloadPath, getUIPath } from "./pathResolver.js";
import { initializeDatabase } from "./db/connectionManager.js";
import { registerDbIpcHandlers } from "./ipc/registerDbIpcHandlers.js";
import { registerDomainIpcHandlers } from "./ipc/registerDomainIpcHandlers.js";

app.on("ready", () => {
  registerDbIpcHandlers();
  registerDomainIpcHandlers();
  // Not awaited - an unreachable Postgres/MySQL host must not hang app launch.
  initializeDatabase();

  const mainWindow = new BrowserWindow({
    webPreferences: {
      preload: getPreloadPath(),
    },
  });
  mainWindow.maximize();
  mainWindow.show();
  if (isDev()) {
    mainWindow.loadURL("http://localhost:5123");
  } else {
    mainWindow.loadFile(path.join(getUIPath()));
  }
});
