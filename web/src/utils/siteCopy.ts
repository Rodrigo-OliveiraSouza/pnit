import type { SiteCopy } from "../data/siteCopy";

const STORAGE_KEY = "pnit_site_copy";
const STORAGE_VERSION = 2;

type StoredSiteCopyPayload = {
  version: number;
  copy: SiteCopy;
};

function decodeUnicodeEscapes(value: string) {
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  );
}

function repairMojibake(value: string) {
  let current = value;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!/[\u00C2\u00C3]/.test(current)) {
      break;
    }

    try {
      const repaired = decodeURIComponent(escape(current));
      if (repaired === current) {
        break;
      }
      current = repaired;
    } catch {
      break;
    }
  }

  return current;
}

function normalizeText(value: string) {
  return repairMojibake(decodeUnicodeEscapes(value));
}

function normalizeSiteCopy(copy: SiteCopy): SiteCopy {
  return {
    header: {
      brandSub: normalizeText(copy.header.brandSub),
      navMap: normalizeText(copy.header.navMap),
      navAccessCode: normalizeText(copy.header.navAccessCode),
      navReports: normalizeText(copy.header.navReports),
      navImages: normalizeText(copy.header.navImages),
      navComplaints: normalizeText(copy.header.navComplaints),
      panelLabel: normalizeText(copy.header.panelLabel),
      loginButton: normalizeText(copy.header.loginButton),
      logoutButton: normalizeText(copy.header.logoutButton),
    },
    login: {
      eyebrow: normalizeText(copy.login.eyebrow),
      title: normalizeText(copy.login.title),
      description: normalizeText(copy.login.description),
      buttonLabel: normalizeText(copy.login.buttonLabel),
      createAccountLabel: normalizeText(copy.login.createAccountLabel),
    },
    footer: {
      description: normalizeText(copy.footer.description),
      transparencyTitle: normalizeText(copy.footer.transparencyTitle),
      transparencyItems: copy.footer.transparencyItems.map(normalizeText),
      contactTitle: normalizeText(copy.footer.contactTitle),
      contactItems: copy.footer.contactItems.map(normalizeText),
      version: normalizeText(copy.footer.version),
    },
  };
}

function unwrapStoredSiteCopy(value: unknown): SiteCopy | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (
    "version" in value &&
    "copy" in value &&
    typeof (value as StoredSiteCopyPayload).version === "number"
  ) {
    return (value as StoredSiteCopyPayload).copy;
  }

  return value as SiteCopy;
}

export function loadStoredSiteCopy(): SiteCopy | null {
  if (typeof window === "undefined") return null;

  const serialized = localStorage.getItem(STORAGE_KEY);
  if (!serialized) return null;

  try {
    const parsed = JSON.parse(serialized) as unknown;
    const copy = unwrapStoredSiteCopy(parsed);
    if (!copy) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const normalized = normalizeSiteCopy(copy);
    persistSiteCopy(normalized);
    return normalized;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function persistSiteCopy(copy: SiteCopy) {
  if (typeof window === "undefined") return;

  const payload: StoredSiteCopyPayload = {
    version: STORAGE_VERSION,
    copy: normalizeSiteCopy(copy),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearStoredSiteCopy() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
