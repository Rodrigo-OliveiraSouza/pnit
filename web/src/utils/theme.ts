import type { ThemeColors, ThemeImageStyles } from "../types/theme";

export const DEFAULT_THEME_COLORS: ThemeColors = {
  primary: "#c8651e",
  secondary: "#b85a16",
  accent: "#f0a23a",
  background: "#f4f4f4",
  text: "#2b1a12",
  border: "#d6d6d6",
  header_start: "#1f2a4a",
  header_end: "#2b3a66",
};

export const DEFAULT_THEME_IMAGE_STYLES: ThemeImageStyles = {
  overlay: "#000000",
  overlay_opacity: 0,
  saturation: 1,
  contrast: 1,
  brightness: 1,
  radius: 24,
  shadow: "0 18px 40px rgba(43,26,18,0.14)",
};

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalizeHex = (value: string) => {
  const raw = value.trim();
  if (!raw) return raw;
  return raw.startsWith("#") ? raw : `#${raw}`;
};

export const resolveThemeColors = (
  colors?: ThemeColors | null
): ThemeColors => ({
  ...DEFAULT_THEME_COLORS,
  ...colors,
  primary: normalizeHex(colors?.primary ?? DEFAULT_THEME_COLORS.primary),
  secondary: normalizeHex(colors?.secondary ?? DEFAULT_THEME_COLORS.secondary),
  accent: normalizeHex(colors?.accent ?? DEFAULT_THEME_COLORS.accent),
  background: normalizeHex(colors?.background ?? DEFAULT_THEME_COLORS.background),
  text: normalizeHex(colors?.text ?? DEFAULT_THEME_COLORS.text),
  border: normalizeHex(colors?.border ?? DEFAULT_THEME_COLORS.border),
  header_start: normalizeHex(
    colors?.header_start ?? DEFAULT_THEME_COLORS.header_start ?? ""
  ),
  header_end: normalizeHex(
    colors?.header_end ?? DEFAULT_THEME_COLORS.header_end ?? ""
  ),
});

export const resolveThemeImageStyles = (
  styles?: ThemeImageStyles | null
): ThemeImageStyles => ({
  ...DEFAULT_THEME_IMAGE_STYLES,
  ...styles,
  overlay: normalizeHex(styles?.overlay ?? DEFAULT_THEME_IMAGE_STYLES.overlay ?? ""),
  overlay_opacity: clampNumber(
    Number(styles?.overlay_opacity ?? DEFAULT_THEME_IMAGE_STYLES.overlay_opacity),
    0,
    1
  ),
  saturation: clampNumber(
    Number(styles?.saturation ?? DEFAULT_THEME_IMAGE_STYLES.saturation),
    0.3,
    3
  ),
  contrast: clampNumber(
    Number(styles?.contrast ?? DEFAULT_THEME_IMAGE_STYLES.contrast),
    0.5,
    2
  ),
  brightness: clampNumber(
    Number(styles?.brightness ?? DEFAULT_THEME_IMAGE_STYLES.brightness),
    0.5,
    2
  ),
  radius: clampNumber(
    Number(styles?.radius ?? DEFAULT_THEME_IMAGE_STYLES.radius),
    0,
    64
  ),
  shadow: styles?.shadow ?? DEFAULT_THEME_IMAGE_STYLES.shadow,
});

const rgbFromHex = (value: string) => {
  const raw = value.replace("#", "").trim();
  if (!raw) return null;
  const hex =
    raw.length === 3
      ? raw
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : raw;
  if (hex.length !== 6) return null;
  const int = Number.parseInt(hex, 16);
  if (Number.isNaN(int)) return null;
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `${r}, ${g}, ${b}`;
};

export const applyThemeToRoot = (
  colors: ThemeColors,
  imageStyles: ThemeImageStyles
) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved = resolveThemeColors(colors);
  const resolvedImages = resolveThemeImageStyles(imageStyles);
  const inkRgb = rgbFromHex(resolved.text) ?? "43, 26, 18";
  const primaryRgb = rgbFromHex(resolved.primary) ?? "200, 101, 30";
  const secondaryRgb = rgbFromHex(resolved.secondary) ?? "184, 90, 22";
  const accentRgb = rgbFromHex(resolved.accent) ?? "240, 162, 58";
  const backgroundRgb = rgbFromHex(resolved.background) ?? "244, 244, 244";
  const borderRgb = rgbFromHex(resolved.border) ?? "214, 214, 214";
  const headerEnd = resolved.header_end ?? resolved.secondary;
  const headerStart = resolved.header_start ?? resolved.primary;
  const headerStartRgb = rgbFromHex(headerStart) ?? primaryRgb;
  const headerEndRgb = rgbFromHex(headerEnd) ?? secondaryRgb;

  root.style.setProperty("--color-forest", resolved.primary);
  root.style.setProperty("--color-amber", resolved.primary);
  root.style.setProperty("--color-clay", resolved.secondary);
  root.style.setProperty("--color-emerald", resolved.secondary);
  root.style.setProperty("--color-sun", resolved.accent);
  root.style.setProperty("--color-sky", resolved.background);
  root.style.setProperty("--color-ivory", resolved.border);
  root.style.setProperty("--color-ink", resolved.text);
  root.style.setProperty("--color-teal", headerEnd);
  root.style.setProperty("--color-earth", resolved.background);
  root.style.setProperty("--color-header-start", headerStart);
  root.style.setProperty("--color-header-end", headerEnd);
  root.style.setProperty("--color-ink-rgb", inkRgb);
  root.style.setProperty("--color-forest-rgb", primaryRgb);
  root.style.setProperty("--color-amber-rgb", primaryRgb);
  root.style.setProperty("--color-clay-rgb", secondaryRgb);
  root.style.setProperty("--color-emerald-rgb", secondaryRgb);
  root.style.setProperty("--color-sun-rgb", accentRgb);
  root.style.setProperty("--color-sky-rgb", backgroundRgb);
  root.style.setProperty("--color-ivory-rgb", borderRgb);
  root.style.setProperty("--color-teal-rgb", headerEndRgb);
  root.style.setProperty("--color-earth-rgb", backgroundRgb);
  root.style.setProperty("--color-header-start-rgb", headerStartRgb);
  root.style.setProperty("--color-header-end-rgb", headerEndRgb);
  root.style.setProperty(
    "--shadow-soft",
    `0 18px 40px rgba(${inkRgb}, 0.14)`
  );
  root.style.setProperty(
    "--shadow-card",
    `0 12px 24px rgba(${inkRgb}, 0.1)`
  );

  root.style.setProperty("--image-overlay", resolvedImages.overlay ?? "#000");
  root.style.setProperty(
    "--image-overlay-opacity",
    String(resolvedImages.overlay_opacity ?? 0)
  );
  root.style.setProperty(
    "--image-saturation",
    String(resolvedImages.saturation ?? 1)
  );
  root.style.setProperty(
    "--image-contrast",
    String(resolvedImages.contrast ?? 1)
  );
  root.style.setProperty(
    "--image-brightness",
    String(resolvedImages.brightness ?? 1)
  );
  root.style.setProperty(
    "--image-radius",
    `${resolvedImages.radius ?? 0}px`
  );
  root.style.setProperty(
    "--image-shadow",
    resolvedImages.shadow ?? "none"
  );
};
