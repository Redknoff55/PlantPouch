import { branding } from "@/config/branding";
import type { BrandingConfig } from "@shared/branding";

export type BrandingState = BrandingConfig;

export const brandingStorageKey = "plantpouch-branding";

export const mergeBranding = (overrides?: Partial<BrandingState>) => ({
  ...branding,
  ...overrides,
  logo: {
    ...branding.logo,
    ...(overrides?.logo ?? {}),
  },
});

export const applyBrandingToDocument = (state: Partial<BrandingState>) => {
  if (typeof document === "undefined") return;
  const next = mergeBranding(state);
  document.documentElement.dataset.fontPreset = next.fontPreset;
};

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

export const saveBrandingToStorage = (state: Partial<BrandingState>) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(brandingStorageKey, JSON.stringify(mergeBranding(state)));
  } catch {
    // Ignore localStorage write failures.
  }
};
