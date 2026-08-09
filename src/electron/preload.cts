const electron = require("electron");

electron.contextBridge.exposeInMainWorld("electron", {
  subscribeStatistics: (callback: (statistics: Statistics) => void) => {
    return ipcOn("statistics", (stats) => {
      callback(stats);
    });
  },
  getStaticData: () => ipcInvoke("getStaticData"),
  getAuthState: () => ipcInvoke("auth:state"),
  setupOwner: (input: import("./domain/types.js").SetupInput) =>
    ipcInvoke("auth:setup", input),
  signIn: (input: import("./domain/types.js").SignInInput) =>
    ipcInvoke("auth:signIn", input),
  signOut: () => ipcInvoke("auth:signOut"),
  changePassword: (input: import("./domain/types.js").ChangePasswordInput) =>
    ipcInvoke("auth:changePassword", input),
  updateProfile: (input: import("./domain/types.js").ProfileUpdateInput) =>
    ipcInvoke("auth:updateProfile", input),
  listUsers: () => ipcInvoke("user:list"),
  createUser: (input: import("./domain/types.js").UserCreateInput) =>
    ipcInvoke("user:create", input),
  updateUser: (input: import("./domain/types.js").UserUpdateInput) =>
    ipcInvoke("user:update", input),
  deleteUser: (id: number) => ipcInvoke("user:delete", id),
  setUserPassword: (input: import("./domain/types.js").UserPasswordInput) =>
    ipcInvoke("user:setPassword", input),
  listRoles: () => ipcInvoke("role:list"),
  listPermissions: () => ipcInvoke("role:permissions"),
  createRole: (input: import("./domain/types.js").RoleInput) =>
    ipcInvoke("role:create", input),
  updateRole: (input: import("./domain/types.js").RoleUpdateInput) =>
    ipcInvoke("role:update", input),
  deleteRole: (id: number) => ipcInvoke("role:delete", id),
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
  previewProductImport: (csv: string) => ipcInvoke("product:importPreview", csv),
  importProducts: (input: import("./domain/types.js").ProductImportInput) =>
    ipcInvoke("product:import", input),
  saveProductImportTemplate: () => ipcInvoke("product:importTemplate"),
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
