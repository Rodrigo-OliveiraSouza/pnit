import type { ThemeColors, ThemeImageStyles, ThemeTypography } from "../types/theme";

export const DEFAULT_THEME_COLORS: ThemeColors = {
  primary: "#c8651e",
  secondary: "#b85a16",
  accent: "#f0a23a",
  background: "#f4f4f4",
  text: "#2b1a12",
  text_muted: "#6b6158",
  heading: "#2b1a12",
  border: "#d6d6d6",
  header_start: "#1f2a4a",
  header_end: "#2b3a66",
  button_primary_bg: "#c8651e",
  button_primary_text: "#ffffff",
  button_secondary_bg: "#ffffff",
  button_secondary_text: "#2b1a12",
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

export const DEFAULT_THEME_TYPOGRAPHY: Required<ThemeTypography> = {
  body: "\"Source Sans 3\", \"Segoe UI\", sans-serif",
  heading: "\"Newsreader\", serif",
  button: "\"Source Sans 3\", \"Segoe UI\", sans-serif",
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
  text_muted: normalizeHex(
    colors?.text_muted ?? DEFAULT_THEME_COLORS.text_muted ?? ""
  ),
  heading: normalizeHex(
    colors?.heading ?? DEFAULT_THEME_COLORS.heading ?? DEFAULT_THEME_COLORS.text
  ),
  border: normalizeHex(colors?.border ?? DEFAULT_THEME_COLORS.border),
  header_start: normalizeHex(
    colors?.header_start ?? DEFAULT_THEME_COLORS.header_start ?? ""
  ),
  header_end: normalizeHex(
    colors?.header_end ?? DEFAULT_THEME_COLORS.header_end ?? ""
  ),
  button_primary_bg: normalizeHex(
    colors?.button_primary_bg ?? DEFAULT_THEME_COLORS.button_primary_bg ?? ""
  ),
  button_primary_text: normalizeHex(
    colors?.button_primary_text ?? DEFAULT_THEME_COLORS.button_primary_text ?? ""
  ),
  button_secondary_bg: normalizeHex(
    colors?.button_secondary_bg ?? DEFAULT_THEME_COLORS.button_secondary_bg ?? ""
  ),
  button_secondary_text: normalizeHex(
    colors?.button_secondary_text ??
      DEFAULT_THEME_COLORS.button_secondary_text ??
      ""
  ),
});

export const resolveThemeTypography = (
  typography?: ThemeTypography | null
): Required<ThemeTypography> => ({
  ...DEFAULT_THEME_TYPOGRAPHY,
  ...typography,
  body: typography?.body ?? DEFAULT_THEME_TYPOGRAPHY.body,
  heading: typography?.heading ?? DEFAULT_THEME_TYPOGRAPHY.heading,
  button: typography?.button ?? DEFAULT_THEME_TYPOGRAPHY.button,
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
  imageStyles: ThemeImageStyles,
  typography?: ThemeTypography | null
) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved = resolveThemeColors(colors);
  const resolvedImages = resolveThemeImageStyles(imageStyles);
  const resolvedTypography = resolveThemeTypography(typography);
  const inkRgb = rgbFromHex(resolved.text) ?? "43, 26, 18";
  const primaryRgb = rgbFromHex(resolved.primary) ?? "200, 101, 30";
  const secondaryRgb = rgbFromHex(resolved.secondary) ?? "184, 90, 22";
  const accentRgb = rgbFromHex(resolved.accent) ?? "240, 162, 58";
  const backgroundRgb = rgbFromHex(resolved.background) ?? "244, 244, 244";
  const borderRgb = rgbFromHex(resolved.border) ?? "214, 214, 214";
  const headingRgb = rgbFromHex(resolved.heading ?? resolved.text) ?? inkRgb;
  const mutedRgb = rgbFromHex(resolved.text_muted ?? resolved.text) ?? inkRgb;
  const headerEnd = resolved.header_end ?? resolved.secondary;
  const headerStart = resolved.header_start ?? resolved.primary;
  const headerStartRgb = rgbFromHex(headerStart) ?? primaryRgb;
  const headerEndRgb = rgbFromHex(headerEnd) ?? secondaryRgb;
  const buttonPrimaryBg =
    resolved.button_primary_bg ?? resolved.primary ?? DEFAULT_THEME_COLORS.primary;
  const buttonPrimaryText =
    resolved.button_primary_text ?? resolved.text ?? DEFAULT_THEME_COLORS.text;
  const buttonSecondaryBg =
    resolved.button_secondary_bg ?? resolved.background ?? DEFAULT_THEME_COLORS.background;
  const buttonSecondaryText =
    resolved.button_secondary_text ?? resolved.text ?? DEFAULT_THEME_COLORS.text;

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
  root.style.setProperty("--color-heading-rgb", headingRgb);
  root.style.setProperty("--color-text-muted-rgb", mutedRgb);
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
  root.style.setProperty("--color-heading", resolved.heading ?? resolved.text);
  root.style.setProperty(
    "--color-text-muted",
    resolved.text_muted ?? resolved.text
  );
  root.style.setProperty(
    "--shadow-soft",
    `0 18px 40px rgba(${inkRgb}, 0.14)`
  );
  root.style.setProperty(
    "--shadow-card",
    `0 12px 24px rgba(${inkRgb}, 0.1)`
  );
  root.style.setProperty("--button-primary-bg", buttonPrimaryBg);
  root.style.setProperty("--button-primary-text", buttonPrimaryText);
  root.style.setProperty("--button-secondary-bg", buttonSecondaryBg);
  root.style.setProperty("--button-secondary-text", buttonSecondaryText);
  root.style.setProperty("--font-body", resolvedTypography.body);
  root.style.setProperty("--font-heading", resolvedTypography.heading);
  root.style.setProperty("--font-button", resolvedTypography.button);

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
