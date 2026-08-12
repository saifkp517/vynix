// Graphics quality is a single 1-5 level stored in localStorage. Every
// graphics-affecting setting (render resolution, grass density, ...) is
// derived from that one level so they always move together.
export const MIN_GRAPHICS_LEVEL = 1;
export const MAX_GRAPHICS_LEVEL = 5;
export const DEFAULT_GRAPHICS_LEVEL = 3;

const STORAGE_KEY = "graphicsQuality";

// Level 5 (high graphics) = dpr 1, 120000 grass blades; dpr scales linearly
// down to 0.2 at level 1. Grass instead interpolates between a 60000 floor and
// the 120000 ceiling — below 60000 the patch visibly thins into bare ground
// rather than just looking lower-detail, so the lowest level still keeps a
// full-looking field.
const MAX_DPR = 1;
const MIN_GRASS_COUNT = 60000;
const MAX_GRASS_COUNT = 120000;

function clampLevel(level: number): number {
  return Math.min(MAX_GRAPHICS_LEVEL, Math.max(MIN_GRAPHICS_LEVEL, Math.round(level)));
}

export function getGraphicsLevel(): number {
  if (typeof window === "undefined") return DEFAULT_GRAPHICS_LEVEL;
  const stored = Number(window.localStorage.getItem(STORAGE_KEY));
  if (!stored || Number.isNaN(stored)) return DEFAULT_GRAPHICS_LEVEL;
  return clampLevel(stored);
}

export function setGraphicsLevel(level: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(clampLevel(level)));
}

export function getDprForLevel(level: number): number {
  return (clampLevel(level) / MAX_GRAPHICS_LEVEL) * MAX_DPR;
}

export function getGrassCountForLevel(level: number): number {
  const t = (clampLevel(level) - MIN_GRAPHICS_LEVEL) / (MAX_GRAPHICS_LEVEL - MIN_GRAPHICS_LEVEL);
  return Math.round(MIN_GRASS_COUNT + t * (MAX_GRASS_COUNT - MIN_GRASS_COUNT));
}
