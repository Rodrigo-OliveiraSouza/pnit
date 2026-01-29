import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SiteCopy } from "../data/siteCopy";
import { DEFAULT_SITE_COPY } from "../data/siteCopy";
import {
  clearStoredSiteCopy,
  loadStoredSiteCopy,
  persistSiteCopy,
} from "../utils/siteCopy";

type SiteCopyContextValue = {
  copy: SiteCopy;
  updateHeaderCopy: (updates: Partial<SiteCopy["header"]>) => void;
  updateLoginCopy: (updates: Partial<SiteCopy["login"]>) => void;
  updateFooterCopy: (updates: Partial<SiteCopy["footer"]>) => void;
  resetSiteCopy: () => void;
};

const SiteCopyContext = createContext<SiteCopyContextValue | null>(null);

const mergeSection = <T extends Record<string, unknown>>(
  base: T,
  override?: Partial<T>
): T => {
  return override ? { ...base, ...override } : base;
};

const mergeSiteCopy = (
  base: SiteCopy,
  override?: Partial<SiteCopy>
): SiteCopy => {
  const merged: SiteCopy = {
    header: mergeSection(base.header, override?.header),
    login: mergeSection(base.login, override?.login),
    footer: mergeSection(base.footer, override?.footer),
  };
  if (base.header.brandSub === "") {
    merged.header.brandSub = "";
  }
  if (base.footer.version === "") {
    merged.footer.version = "";
  }
  return merged;
};

export function SiteCopyProvider({ children }: { children: ReactNode }) {
  const [copy, setCopy] = useState<SiteCopy>(DEFAULT_SITE_COPY);

  useEffect(() => {
    const stored = loadStoredSiteCopy();
    if (stored) {
      setCopy((current) => {
        const merged = mergeSiteCopy(current, stored);
        persistSiteCopy(merged);
        return merged;
      });
    }
  }, []);

  const updateSection = useCallback(
    <K extends keyof SiteCopy>(
      section: K,
      updates: Partial<SiteCopy[K]>
    ) => {
      setCopy((current) => {
        const next: SiteCopy = {
          ...current,
          [section]: { ...current[section], ...updates },
        };
        persistSiteCopy(next);
        return next;
      });
    },
    []
  );

  const updateHeaderCopy = useCallback(
    (updates: Partial<SiteCopy["header"]>) => updateSection("header", updates),
    [updateSection]
  );

  const updateLoginCopy = useCallback(
    (updates: Partial<SiteCopy["login"]>) => updateSection("login", updates),
    [updateSection]
  );

  const updateFooterCopy = useCallback(
    (updates: Partial<SiteCopy["footer"]>) => updateSection("footer", updates),
    [updateSection]
  );

  const resetSiteCopy = useCallback(() => {
    clearStoredSiteCopy();
    persistSiteCopy(DEFAULT_SITE_COPY);
    setCopy(DEFAULT_SITE_COPY);
  }, []);

  const value = useMemo(
    () => ({
      copy,
      updateHeaderCopy,
      updateLoginCopy,
      updateFooterCopy,
      resetSiteCopy,
    }),
    [copy, updateHeaderCopy, updateLoginCopy, updateFooterCopy, resetSiteCopy]
  );

  return (
    <SiteCopyContext.Provider value={value}>
      {children}
    </SiteCopyContext.Provider>
  );
}

export function useSiteCopy() {
  const context = useContext(SiteCopyContext);
  if (!context) {
    throw new Error("useSiteCopy must be used within a SiteCopyProvider");
  }
  return context;
}
