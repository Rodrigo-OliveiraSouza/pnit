import type { SiteCopy } from "../data/siteCopy";

const STORAGE_KEY = "pnit_site_copy";

export function loadStoredSiteCopy(): SiteCopy | null {
  if (typeof window === "undefined") return null;
  const serialized = localStorage.getItem(STORAGE_KEY);
  if (!serialized) return null;
  try {
    return JSON.parse(serialized) as SiteCopy;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function persistSiteCopy(copy: SiteCopy) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
}

export function clearStoredSiteCopy() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
