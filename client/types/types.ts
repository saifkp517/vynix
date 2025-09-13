export interface ThemeConfig {
  name: string;
  primaryColor: string;
  borderRadius: "small" | "medium" | "large" | "none";
  fontFamily: string;
  gameMode?: "casual" | "competitive" | "tournament";
  uiStyle?: "minimal" | "standard" | "intense";
}

export const PLAYER_RADIUS = 1;