export interface UserProfile {
  fullName: string;
  email: string;
  phone: string;
  avatar: string;
}

const STORAGE_KEY = "userProfile";

export const defaultUserProfile: UserProfile = {
  fullName: "",
  email: "",
  phone: "",
  avatar: "",
};

export function getUserProfile(): UserProfile {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultUserProfile;

  try {
    return { ...defaultUserProfile, ...JSON.parse(raw) };
  } catch {
    return defaultUserProfile;
  }
}

export function saveUserProfile(profile: UserProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}
