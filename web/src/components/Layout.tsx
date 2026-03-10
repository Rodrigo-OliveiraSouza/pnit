import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import { fetchActiveTheme } from "../services/api";
import {
  applyThemeToRoot,
  resolveThemeColors,
  resolveThemeImageStyles,
  resolveThemeTypography,
} from "../utils/theme";
import { SiteCopyProvider } from "../providers/SiteCopyProvider";
import { useAppVersionSync } from "../hooks/useAppVersionSync";

export default function Layout() {
  const baseUrl = import.meta.env.BASE_URL || "/";
  useAppVersionSync(baseUrl);

  useEffect(() => {
    let active = true;
    const loadTheme = async () => {
      try {
        const response = await fetchActiveTheme();
        if (!active || !response.theme) return;
        const colors = resolveThemeColors(response.theme.colors ?? undefined);
        const imageStyles = resolveThemeImageStyles(
          response.theme.image_styles ?? undefined
        );
        const typography = resolveThemeTypography(
          response.theme.typography ?? undefined
        );
        applyThemeToRoot(colors, imageStyles, typography);
      } catch {
        // Keep default theme on failure.
      }
    };
    void loadTheme();
    return () => {
      active = false;
    };
  }, []);

  return (
    <SiteCopyProvider>
      <div className="app-shell">
        <Header />
        <main className="app-main">
          <Outlet />
        </main>
        <Footer />
      </div>
    </SiteCopyProvider>
  );
}
