"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes";
import { createContext, useContext, useState, useEffect } from "react";
import { ThemeConfig } from "@/types/theme";
import { defaultTheme, getGameModeClass, getUIStyleClass } from "@/lib/theme-config";

type ThemeConfigContextType = {
  theme: ThemeConfig;
  updateTheme: (theme: Partial<ThemeConfig>) => void;
};

const ThemeConfigContext = createContext<ThemeConfigContextType | undefined>(undefined);

export function ThemeConfigProvider({
  children,
  defaultThemeConfig = defaultTheme,
}: {
  children: React.ReactNode;
  defaultThemeConfig?: ThemeConfig;
}) {
  const [theme, setTheme] = useState<ThemeConfig>(defaultThemeConfig);

  useEffect(() => {
    const savedTheme = localStorage.getItem("ui-theme");
    if (savedTheme) {
      try {
        setTheme({ ...defaultThemeConfig, ...JSON.parse(savedTheme) });
      } catch (e) {
        console.error("Failed to parse saved theme", e);
      }
    }
  }, [defaultThemeConfig]);

  const updateTheme = (newTheme: Partial<ThemeConfig>) => {
    const updatedTheme = { ...theme, ...newTheme };
    setTheme(updatedTheme);
    localStorage.setItem("ui-theme", JSON.stringify(updatedTheme));
    
    // Update CSS variables if needed
    document.documentElement.style.setProperty(
      "--radius",
      theme.borderRadius === "none" 
        ? "0" 
        : theme.borderRadius === "small" 
          ? "0.125rem" 
          : theme.borderRadius === "medium" 
            ? "0.375rem" 
            : "0.5rem"
    );

    // Set data attributes for themes
    document.documentElement.setAttribute("data-theme", theme.name);
    document.documentElement.setAttribute("data-radius", theme.borderRadius);
    document.documentElement.setAttribute("data-font", theme.fontFamily);
    
    // Set game-specific attributes
    if (theme.gameMode) {
      document.documentElement.setAttribute("data-game-mode", theme.gameMode);
      document.documentElement.classList.remove("game-mode-casual", "game-mode-competitive", "game-mode-tournament");
      document.documentElement.classList.add(getGameModeClass(theme.gameMode));
    }
    
    if (theme.uiStyle) {
      document.documentElement.setAttribute("data-ui-style", theme.uiStyle);
      document.documentElement.classList.remove("ui-minimal", "ui-standard", "ui-intense");
      document.documentElement.classList.add(getUIStyleClass(theme.uiStyle));
    }
  };

  return (
    <ThemeConfigContext.Provider value={{ theme, updateTheme }}>
      {children}
    </ThemeConfigContext.Provider>
  );
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light" // Gaming apps often default to dark mode
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <ThemeConfigProvider>
        {children}
      </ThemeConfigProvider>
    </NextThemesProvider>
  );
}

export const useThemeConfig = () => {
  const context = useContext(ThemeConfigContext);
  if (context === undefined) {
    throw new Error("useThemeConfig must be used within a ThemeConfigProvider");
  }
  return context;
};