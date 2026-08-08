const electron = require("electron");

electron.contextBridge.exposeInMainWorld("electron", {
  subscribeStatistics: (callback: (statistics: Statistics) => void) => {
    return ipcOn("statistics", (stats) => {
      callback(stats);
    });
  },
  getStaticData: () => ipcInvoke("getStaticData"),
  getDbConfig: () => ipcInvoke("db:getConfig"),
  saveDbConfig: (input: import("./db/types.js").DbConfigInput) =>
    ipcInvoke("db:saveConfig", input),
  testDbConnection: (input: import("./db/types.js").CloudConnectionInput) =>
    ipcInvoke("db:testConnection", input),
  getDbStatus: () => ipcInvoke("db:getStatus"),
  getBusinessConfig: () => ipcInvoke("business:get"),
  saveBusinessConfig: (
    input: Omit<import("./domain/types.js").BusinessConfig, "logo">
  ) => ipcInvoke("business:save", input),
  saveBusinessLogo: (dataUrl: string | null) => ipcInvoke("business:saveLogo", dataUrl),
  getInvoices: () => ipcInvoke("invoice:list"),
  getInvoiceById: (id: string) => ipcInvoke("invoice:get", id),
  createInvoice: (input: import("./domain/types.js").SavedInvoiceInput) =>
    ipcInvoke("invoice:create", input),
  deleteInvoice: (id: string) => ipcInvoke("invoice:delete", id),
  lookupCustomers: (input: import("./domain/types.js").CustomerLookupInput) =>
    ipcInvoke("customer:lookup", input),
  listCustomers: (search?: string) => ipcInvoke("customer:list", search),
  getCustomerInvoices: (id: number) => ipcInvoke("customer:invoices", id),
  updateCustomer: (input: import("./domain/types.js").CustomerUpdateInput) =>
    ipcInvoke("customer:update", input),
  deleteCustomer: (id: number) => ipcInvoke("customer:delete", id),
  searchProducts: (query: string) => ipcInvoke("product:search", query),
  listProducts: (search?: string) => ipcInvoke("product:list", search),
  createProduct: (input: import("./domain/types.js").ProductInput) =>
    ipcInvoke("product:create", input),
  updateProduct: (input: import("./domain/types.js").ProductUpdateInput) =>
    ipcInvoke("product:update", input),
  deleteProduct: (id: number) => ipcInvoke("product:delete", id),
  getDashboardInsights: (input: import("./domain/types.js").InsightsRangeInput) =>
    ipcInvoke("insights:dashboard", input),
} satisfies Window["electron"]);

function ipcInvoke<Key extends keyof EventPayloadMapping>(
  key: Key,
  ...args: EventPayloadMapping[Key]["args"]
): Promise<EventPayloadMapping[Key]["return"]> {
  return electron.ipcRenderer.invoke(key, ...args);
}

function ipcOn<Key extends keyof EventPayloadMapping>(
  key: Key,
  callback: (payload: EventPayloadMapping[Key]["return"]) => void
) {
  const cb = (_: Electron.IpcRendererEvent, payload: any) => callback(payload);
  electron.ipcRenderer.on(key, cb);
  return () => electron.ipcRenderer.off(key, cb);
}
