"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useThemeConfig } from "@/app/theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Moon, Sun, Palette, CircleUser, Check, Trophy, Zap, Laptop } from "lucide-react";
import { 
  availableBorderRadius, 
  availableColors, 
  availableFonts,
  availableGameModes,
  availableUIStyles 
} from "@/lib/theme-config";

export function ThemeSwitcher() {
  const { setTheme, theme } = useTheme();
  const { theme: configTheme, updateTheme } = useThemeConfig();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" />
          Light Mode
          {theme === "light" && <Check className="ml-auto h-4 w-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          Dark Mode
          {theme === "dark" && <Check className="ml-auto h-4 w-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Laptop className="mr-2 h-4 w-4" />
          System Default
          {theme === "system" && <Check className="ml-auto h-4 w-4" />}
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuLabel>Game Mode</DropdownMenuLabel>
        <DropdownMenuRadioGroup 
          value={configTheme.gameMode}
          onValueChange={(value: any) => updateTheme({ gameMode: value })}
        >
          {availableGameModes.map((mode) => (
            <DropdownMenuRadioItem key={mode.value} value={mode.value}>
              {mode.value === "tournament" ? (
                <Trophy className="mr-2 h-4 w-4" />
              ) : mode.value === "competitive" ? (
                <Zap className="mr-2 h-4 w-4" />
              ) : (
                <CircleUser className="mr-2 h-4 w-4" />
              )}
              {mode.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuLabel>UI Intensity</DropdownMenuLabel>
        <DropdownMenuRadioGroup 
          value={configTheme.uiStyle}
          onValueChange={(value: any) => updateTheme({ uiStyle: value })}
        >
          {availableUIStyles.map((style) => (
            <DropdownMenuRadioItem key={style.value} value={style.value}>
              {style.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuLabel>Primary Color</DropdownMenuLabel>
        <div className="grid grid-cols-4 gap-1 p-2">
          {availableColors.map((color) => (
            <Button
              key={color.value}
              variant="outline"
              size="sm"
              className={`h-8 w-full gap-1 ${
                configTheme.primaryColor === color.value ? "border-2 border-primary" : ""
              }`}
              style={{
                backgroundColor: `hsl(var(--${color.value}))`,
              }}
              onClick={() => updateTheme({ primaryColor: color.value })}
            />
          ))}
        </div>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuLabel>Border Radius</DropdownMenuLabel>
        <DropdownMenuRadioGroup 
          value={configTheme.borderRadius}
          onValueChange={(value: any) => updateTheme({ borderRadius: value })}
        >
          {availableBorderRadius.map((radius) => (
            <DropdownMenuRadioItem key={radius.value} value={radius.value}>
              {radius.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuLabel>Font</DropdownMenuLabel>
        <DropdownMenuRadioGroup 
          value={configTheme.fontFamily}
          onValueChange={(value: any) => updateTheme({ fontFamily: value })}
        >
          {availableFonts.map((font) => (
            <DropdownMenuRadioItem 
              key={font.value} 
              value={font.value}
              className={font.value === "mono" ? "font-mono" : ""}
            >
              {font.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}