import { branding } from "@/config/branding";

export type BrandingState = {
  appName: string;
  version: string;
  logo: {
    text?: string;
    imageSrc?: string;
    alt?: string;
  };
};

export const brandingStorageKey = "plantpouch-branding";

export const mergeBranding = (overrides?: Partial<BrandingState>) => ({
  ...branding,
  ...overrides,
  logo: {
    ...branding.logo,
    ...(overrides?.logo ?? {}),
  },
});

export const loadBrandingFromStorage = (): BrandingState => {
  if (typeof window === "undefined") return branding;
  try {
    const raw = localStorage.getItem(brandingStorageKey);
    if (!raw) return branding;
    return mergeBranding(JSON.parse(raw) as Partial<BrandingState>);
  } catch {
    return branding;
  }
};
