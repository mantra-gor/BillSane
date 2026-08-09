type Statistics = {
  cpuUsage: number;
  ramUsage: number;
  storageUsage: number;
};

type StaticData = {
  totalStorage: number;
  cpuModal: string;
  totalMemory: number;
};

type EventPayloadMapping = {
  statistics: { args: []; return: Statistics };
  getStaticData: { args: []; return: StaticData };
  "auth:state": {
    args: [];
    return: import("./src/electron/domain/types.js").AuthState;
  };
  "auth:setup": {
    args: [import("./src/electron/domain/types.js").SetupInput];
    return: import("./src/electron/domain/types.js").AuthResult;
  };
  "auth:signIn": {
    args: [import("./src/electron/domain/types.js").SignInInput];
    return: import("./src/electron/domain/types.js").AuthResult;
  };
  "auth:signOut": { args: []; return: void };
  "auth:changePassword": {
    args: [import("./src/electron/domain/types.js").ChangePasswordInput];
    return: import("./src/electron/db/types.js").DbOperationResult;
  };
  "auth:updateProfile": {
    args: [import("./src/electron/domain/types.js").ProfileUpdateInput];
    return: import("./src/electron/domain/types.js").AuthResult;
  };
  "user:list": {
    args: [];
    return: import("./src/electron/domain/types.js").UserSummary[];
  };
  "user:create": {
    args: [import("./src/electron/domain/types.js").UserCreateInput];
    return: import("./src/electron/db/types.js").DbOperationResult;
  };
  "user:update": {
    args: [import("./src/electron/domain/types.js").UserUpdateInput];
    return: import("./src/electron/db/types.js").DbOperationResult;
  };
  "user:delete": {
    args: [number];
    return: import("./src/electron/db/types.js").DbOperationResult;
  };
  "user:setPassword": {
    args: [import("./src/electron/domain/types.js").UserPasswordInput];
    return: import("./src/electron/db/types.js").DbOperationResult;
  };
  "role:list": {
    args: [];
    return: import("./src/electron/domain/types.js").RoleSummary[];
  };
  "role:permissions": {
    args: [];
    return: import("./src/electron/domain/types.js").PermissionGroupInfo[];
  };
  "role:create": {
    args: [import("./src/electron/domain/types.js").RoleInput];
    return: import("./src/electron/db/types.js").DbOperationResult;
  };
  "role:update": {
    args: [import("./src/electron/domain/types.js").RoleUpdateInput];
    return: import("./src/electron/db/types.js").DbOperationResult;
  };
  "role:delete": {
    args: [number];
    return: import("./src/electron/db/types.js").DbOperationResult;
  };
  "db:getConfig": {
    args: [];
    return: import("./src/electron/db/types.js").DbConfigRedacted;
  };
  "db:saveConfig": {
    args: [import("./src/electron/db/types.js").DbConfigInput];
    return: import("./src/electron/db/types.js").DbOperationResult;
  };
  "db:testConnection": {
    args: [import("./src/electron/db/types.js").CloudConnectionInput];
    return: import("./src/electron/db/types.js").DbOperationResult;
  };
  "db:getStatus": {
    args: [];
    return: import("./src/electron/db/types.js").DbStatus;
  };
  "business:get": {
    args: [];
    return: import("./src/electron/domain/types.js").BusinessConfig;
  };
  "business:save": {
    args: [Omit<import("./src/electron/domain/types.js").BusinessConfig, "logo">];
    return: import("./src/electron/db/types.js").DbOperationResult;
  };
  "business:saveLogo": {
    args: [string | null];
    return: import("./src/electron/db/types.js").DbOperationResult;
  };
  "invoice:list": {
    args: [];
    return: import("./src/electron/domain/types.js").SavedInvoice[];
  };
  "invoice:get": {
    args: [string];
    return: import("./src/electron/domain/types.js").SavedInvoice | undefined;
  };
  "invoice:create": {
    args: [import("./src/electron/domain/types.js").SavedInvoiceInput];
    return: import("./src/electron/domain/types.js").SavedInvoice;
  };
  "invoice:delete": {
    args: [string];
    return: import("./src/electron/db/types.js").DbOperationResult;
  };
  "customer:lookup": {
    args: [import("./src/electron/domain/types.js").CustomerLookupInput];
    return: import("./src/electron/domain/types.js").CustomerMatch[];
  };
  "customer:list": {
    args: [string | undefined];
    return: import("./src/electron/domain/types.js").CustomerSummary[];
  };
  "customer:invoices": {
    args: [number];
    return: import("./src/electron/domain/types.js").RecentInvoice[];
  };
  "customer:update": {
    args: [import("./src/electron/domain/types.js").CustomerUpdateInput];
    return: import("./src/electron/db/types.js").DbOperationResult;
  };
  "customer:delete": {
    args: [number];
    return: import("./src/electron/db/types.js").DbOperationResult;
  };
  "product:search": {
    args: [string];
    return: import("./src/electron/domain/types.js").ProductOption[];
  };
  "product:list": {
    args: [string | undefined];
    return: import("./src/electron/domain/types.js").ProductSummary[];
  };
  "product:create": {
    args: [import("./src/electron/domain/types.js").ProductInput];
    return: import("./src/electron/db/types.js").DbOperationResult;
  };
  "product:update": {
    args: [import("./src/electron/domain/types.js").ProductUpdateInput];
    return: import("./src/electron/db/types.js").DbOperationResult;
  };
  "product:delete": {
    args: [number];
    return: import("./src/electron/db/types.js").DbOperationResult;
  };
  "product:importPreview": {
    args: [string];
    return: import("./src/electron/domain/types.js").ProductImportPreviewResult;
  };
  "product:import": {
    args: [import("./src/electron/domain/types.js").ProductImportInput];
    return: import("./src/electron/domain/types.js").ProductImportResult;
  };
  "product:importTemplate": {
    args: [];
    return: import("./src/electron/domain/types.js").SaveFileResult;
  };
  "insights:dashboard": {
    args: [import("./src/electron/domain/types.js").InsightsRangeInput];
    return: import("./src/electron/domain/types.js").DashboardInsights;
  };
};

type UnsubscribeFunction = () => void;

interface LabeledInputProps {
  name?: string;
  title: string;
  type: string;
  tabIndex?: number;
  placeholder?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  name: string;
  type: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}

interface LineItem {
  id: number;
  // The catalog item this line sold, when one is known. Absent means the name
  // was typed straight into the grid - `invoice:create` then adds it to the
  // inventory table, and the owner counts it later.
  productId?: number;
  itemName?: string;
  rate?: number;
  // Free-text label (e.g. "GST"), not a numeric code - matches what the
  // InvoiceCreate "Tax Type" column actually collects (a text input).
  taxType?: string;
  taxPer?: number;
  qty?: number;
  tax?: number;
  subTotal?: number;
}

interface Window {
  electron: {
    subscribeStatistics: (
      callback: (statistics: Statistics) => void
    ) => UnsubscribeFunction;
    getStaticData: () => Promise<StaticData>;
    getAuthState: () => Promise<
      import("./src/electron/domain/types.js").AuthState
    >;
    setupOwner: (
      input: import("./src/electron/domain/types.js").SetupInput
    ) => Promise<import("./src/electron/domain/types.js").AuthResult>;
    signIn: (
      input: import("./src/electron/domain/types.js").SignInInput
    ) => Promise<import("./src/electron/domain/types.js").AuthResult>;
    signOut: () => Promise<void>;
    changePassword: (
      input: import("./src/electron/domain/types.js").ChangePasswordInput
    ) => Promise<import("./src/electron/db/types.js").DbOperationResult>;
    updateProfile: (
      input: import("./src/electron/domain/types.js").ProfileUpdateInput
    ) => Promise<import("./src/electron/domain/types.js").AuthResult>;
    listUsers: () => Promise<
      import("./src/electron/domain/types.js").UserSummary[]
    >;
    createUser: (
      input: import("./src/electron/domain/types.js").UserCreateInput
    ) => Promise<import("./src/electron/db/types.js").DbOperationResult>;
    updateUser: (
      input: import("./src/electron/domain/types.js").UserUpdateInput
    ) => Promise<import("./src/electron/db/types.js").DbOperationResult>;
    deleteUser: (
      id: number
    ) => Promise<import("./src/electron/db/types.js").DbOperationResult>;
    setUserPassword: (
      input: import("./src/electron/domain/types.js").UserPasswordInput
    ) => Promise<import("./src/electron/db/types.js").DbOperationResult>;
    listRoles: () => Promise<
      import("./src/electron/domain/types.js").RoleSummary[]
    >;
    listPermissions: () => Promise<
      import("./src/electron/domain/types.js").PermissionGroupInfo[]
    >;
    createRole: (
      input: import("./src/electron/domain/types.js").RoleInput
    ) => Promise<import("./src/electron/db/types.js").DbOperationResult>;
    updateRole: (
      input: import("./src/electron/domain/types.js").RoleUpdateInput
    ) => Promise<import("./src/electron/db/types.js").DbOperationResult>;
    deleteRole: (
      id: number
    ) => Promise<import("./src/electron/db/types.js").DbOperationResult>;
    getDbConfig: () => Promise<
      import("./src/electron/db/types.js").DbConfigRedacted
    >;
    saveDbConfig: (
      input: import("./src/electron/db/types.js").DbConfigInput
    ) => Promise<import("./src/electron/db/types.js").DbOperationResult>;
    testDbConnection: (
      input: import("./src/electron/db/types.js").CloudConnectionInput
    ) => Promise<import("./src/electron/db/types.js").DbOperationResult>;
    getDbStatus: () => Promise<import("./src/electron/db/types.js").DbStatus>;
    getBusinessConfig: () => Promise<
      import("./src/electron/domain/types.js").BusinessConfig
    >;
    saveBusinessConfig: (
      input: Omit<import("./src/electron/domain/types.js").BusinessConfig, "logo">
    ) => Promise<import("./src/electron/db/types.js").DbOperationResult>;
    saveBusinessLogo: (
      dataUrl: string | null
    ) => Promise<import("./src/electron/db/types.js").DbOperationResult>;
    getInvoices: () => Promise<import("./src/electron/domain/types.js").SavedInvoice[]>;
    getInvoiceById: (
      id: string
    ) => Promise<import("./src/electron/domain/types.js").SavedInvoice | undefined>;
    createInvoice: (
      input: import("./src/electron/domain/types.js").SavedInvoiceInput
    ) => Promise<import("./src/electron/domain/types.js").SavedInvoice>;
    deleteInvoice: (
      id: string
    ) => Promise<import("./src/electron/db/types.js").DbOperationResult>;
    lookupCustomers: (
      input: import("./src/electron/domain/types.js").CustomerLookupInput
    ) => Promise<import("./src/electron/domain/types.js").CustomerMatch[]>;
    listCustomers: (
      search?: string
    ) => Promise<import("./src/electron/domain/types.js").CustomerSummary[]>;
    getCustomerInvoices: (
      id: number
    ) => Promise<import("./src/electron/domain/types.js").RecentInvoice[]>;
    updateCustomer: (
      input: import("./src/electron/domain/types.js").CustomerUpdateInput
    ) => Promise<import("./src/electron/db/types.js").DbOperationResult>;
    deleteCustomer: (
      id: number
    ) => Promise<import("./src/electron/db/types.js").DbOperationResult>;
    searchProducts: (
      query: string
    ) => Promise<import("./src/electron/domain/types.js").ProductOption[]>;
    listProducts: (
      search?: string
    ) => Promise<import("./src/electron/domain/types.js").ProductSummary[]>;
    createProduct: (
      input: import("./src/electron/domain/types.js").ProductInput
    ) => Promise<import("./src/electron/db/types.js").DbOperationResult>;
    updateProduct: (
      input: import("./src/electron/domain/types.js").ProductUpdateInput
    ) => Promise<import("./src/electron/db/types.js").DbOperationResult>;
    deleteProduct: (
      id: number
    ) => Promise<import("./src/electron/db/types.js").DbOperationResult>;
    previewProductImport: (
      csv: string
    ) => Promise<import("./src/electron/domain/types.js").ProductImportPreviewResult>;
    importProducts: (
      input: import("./src/electron/domain/types.js").ProductImportInput
    ) => Promise<import("./src/electron/domain/types.js").ProductImportResult>;
    saveProductImportTemplate: () => Promise<
      import("./src/electron/domain/types.js").SaveFileResult
    >;
    getDashboardInsights: (
      range: import("./src/electron/domain/types.js").InsightsRangeInput
    ) => Promise<import("./src/electron/domain/types.js").DashboardInsights>;
  };
}
