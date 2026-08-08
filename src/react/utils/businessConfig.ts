export interface BusinessConfig {
  companyName: string;
  phone: string;
  email: string;
  gstNo: string;
  address: string;
  logo: string;
}

export const defaultBusinessConfig: BusinessConfig = {
  companyName: "",
  phone: "",
  email: "",
  gstNo: "",
  address: "",
  logo: "",
};

export async function getBusinessConfig(): Promise<BusinessConfig> {
  try {
    const config = await window.electron.getBusinessConfig();
    return { ...defaultBusinessConfig, ...config };
  } catch {
    return defaultBusinessConfig;
  }
}

export async function saveBusinessConfig(config: BusinessConfig): Promise<void> {
  const { logo, ...fields } = config;
  const [fieldsResult, logoResult] = await Promise.all([
    window.electron.saveBusinessConfig(fields),
    window.electron.saveBusinessLogo(logo || null),
  ]);
  if (!fieldsResult.ok) throw new Error(fieldsResult.error);
  if (!logoResult.ok) throw new Error(logoResult.error);
}
