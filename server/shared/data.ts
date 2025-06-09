import type { PlayerMap, Room } from "./types";


export const allowedOrigins = [
  "http://localhost:3000",
  "https://vynix-kohl.vercel.app",
  "https://upload-delivering-wildlife-cartridge.trycloudflare.com",
];

export let players: PlayerMap = {};

export const rooms: Room[] = [];

export const CELL_SIZE = 100;
export type Grid = Map<string, Set<string>>;
export const grid: Grid = new Map();