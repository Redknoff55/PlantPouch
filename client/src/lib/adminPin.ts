export const adminPinKey = "plantpouch-admin-pin";
export const adminUnlockKey = "plantpouch-admin-unlocked";

export const getStoredPin = (): string => {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(adminPinKey) ?? "";
};

export const setStoredPin = (pin: string) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(adminPinKey, pin);
};

export const clearStoredPin = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(adminPinKey);
};

export const isAdminUnlocked = (): boolean => {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(adminUnlockKey) === "true";
};

export const setAdminUnlocked = (unlocked: boolean) => {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(adminUnlockKey, unlocked ? "true" : "false");
};
