import { ThemeConfig } from "@/types/types";

export const defaultTheme: ThemeConfig = {
  name: "default",
  primaryColor: "violet", // Changed to violet for a more vibrant gaming theme
  borderRadius: "medium",
  fontFamily: "inter",
  gameMode: "competitive",
  uiStyle: "standard",
};

export const availableColors = [
  { name: "slate", value: "slate" },
  { name: "gray", value: "gray" },
  { name: "zinc", value: "zinc" },
  { name: "neutral", value: "neutral" },
  { name: "stone", value: "stone" },
  { name: "red", value: "red" },
  { name: "orange", value: "orange" },
  { name: "amber", value: "amber" },
  { name: "yellow", value: "yellow" },
  { name: "lime", value: "lime" },
  { name: "green", value: "green" },
  { name: "emerald", value: "emerald" },
  { name: "teal", value: "teal" },
  { name: "cyan", value: "cyan" },
  { name: "sky", value: "sky" },
  { name: "blue", value: "blue" },
  { name: "indigo", value: "indigo" },
  { name: "violet", value: "violet" },
  { name: "purple", value: "purple" },
  { name: "fuchsia", value: "fuchsia" },
  { name: "pink", value: "pink" },
  { name: "rose", value: "rose" },
];

export const availableBorderRadius = [
  { name: "None", value: "none" },
  { name: "Small", value: "small" },
  { name: "Medium", value: "medium" },
  { name: "Large", value: "large" },
];

export const availableFonts = [
  { name: "Inter", value: "inter" },
  { name: "System", value: "system" },
  { name: "Mono", value: "mono" },
];

export const availableGameModes = [
  { name: "Casual", value: "casual" },
  { name: "Competitive", value: "competitive" },
  { name: "Tournament", value: "tournament" },
];

export const availableUIStyles = [
  { name: "Minimal", value: "minimal" },
  { name: "Standard", value: "standard" },
  { name: "Intense", value: "intense" },
];

export const getRadiusClass = (radius: ThemeConfig["borderRadius"]): string => {
  switch (radius) {
    case "none":
      return "rounded-none";
    case "small":
      return "rounded-sm";
    case "medium":
      return "rounded-md";
    case "large":
      return "rounded-lg";
    default:
      return "rounded-md";
  }
};

export const getFontClass = (font: ThemeConfig["fontFamily"]): string => {
  switch (font) {
    case "inter":
      return "font-sans";
    case "system":
      return "font-sans";
    case "mono":
      return "font-mono";
    default:
      return "font-sans";
  }
};

export const getGameModeClass = (mode: ThemeConfig["gameMode"]): string => {
  switch (mode) {
    case "casual":
      return "game-mode-casual";
    case "competitive":
      return "game-mode-competitive";
    case "tournament":
      return "game-mode-tournament";
    default:
      return "game-mode-competitive";
  }
};

export const getUIStyleClass = (style: ThemeConfig["uiStyle"]): string => {
  switch (style) {
    case "minimal":
      return "ui-minimal";
    case "standard":
      return "ui-standard";
    case "intense":
      return "ui-intense";
    default:
      return "ui-standard";
  }
};
