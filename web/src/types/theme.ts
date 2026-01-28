export type ThemeColors = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  border: string;
  header_start?: string;
  header_end?: string;
  button_primary_bg?: string;
  button_primary_text?: string;
  button_secondary_bg?: string;
  button_secondary_text?: string;
};

export type ThemeImageStyles = {
  overlay?: string;
  overlay_opacity?: number;
  saturation?: number;
  contrast?: number;
  brightness?: number;
  radius?: number;
  shadow?: string;
};

export type ThemePalette = {
  id: string;
  name: string;
  colors: ThemeColors | null;
  image_styles: ThemeImageStyles | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ThemeListResponse = {
  items: ThemePalette[];
  active_theme_id?: string | null;
};

export type ThemeActiveResponse = {
  theme: ThemePalette | null;
};
