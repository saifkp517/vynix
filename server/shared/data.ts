import type { PlayerMap, Room, Player } from "./types";
import { redis } from "./redisClient";

export const allowedOrigins = [
  "http://localhost:3000",
  "https://vynix-kohl.vercel.app",
];

// ================== SHARED PLAYERS ============================ 

const PLAYER_KEY = 'players';

export const setPlayer = async (id: string, player: Player) => {
  await redis.hSet(PLAYER_KEY, id, JSON.stringify(player));
}

export const getPlayer = async (id: string): Promise<Player | null> => {
  const data = await redis.hGet(PLAYER_KEY, id);
  return data ? JSON.parse(data) : null;
};

export const getAllPlayers = async (): Promise<Record<string, Player>> => {
  const all = await redis.hGetAll(PLAYER_KEY);
  const result: Record<string, Player> = {};
  for (const [id, json] of Object.entries(all)) {
    result[id] = JSON.parse(json);
  }
  return result;
};

export const deletePlayer = async (id: string) => {
  await redis.hDel(PLAYER_KEY, id);
};


// ============================================================== 



// ================== SHARED ROOMS ============================ 

const ROOM_KEY = 'rooms';

export const addRoom = async (room: Room) => {
  await redis.rPush(ROOM_KEY, JSON.stringify(room));
};

export const getAllRooms = async (): Promise<Room[]> => {
  const data = await redis.lRange(ROOM_KEY, 0, -1);
  return data.map((room) => JSON.parse(room));
};

export const clearRooms = async () => {
  await redis.del(ROOM_KEY);
};


// ============================================================== 




export let players: PlayerMap = {};

export const rooms: Room[] = [];

export const CELL_SIZE = 100;
export type Grid = Map<string, Set<string>>;
export const grid: Grid = new Map();