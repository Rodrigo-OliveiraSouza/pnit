import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import FloatingSymbols from "./FloatingSymbols";
import { fetchActiveTheme } from "../services/api";
import {
  applyThemeToRoot,
  resolveThemeColors,
  resolveThemeImageStyles,
} from "../utils/theme";
import { SiteCopyProvider } from "../providers/SiteCopyProvider";

export default function Layout() {
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
        applyThemeToRoot(colors, imageStyles);
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
        <FloatingSymbols />
        <Header />
        <main className="app-main">
          <Outlet />
        </main>
        <Footer />
      </div>
    </SiteCopyProvider>
  );
}
