import type { Player } from "./types";
import type { AuthenticatedSocket } from "./types";
import { generateTreePositions } from "./utils";
import { v4 as uuidv4 } from "uuid"
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
const MAX_PLAYERS = 50;

export const createRoom = async (): Promise<string> => {
  const roomId = uuidv4();

  const vegetation = generateTreePositions();

  await redis.set(`room:${roomId}:vegetation`, JSON.stringify(vegetation));

  return roomId;
}

export const getRoom = async (roomId: string) => {

  const vegetationPositions = await redis.get(`room:${roomId}:vegetation`);
  const roomPlayers = await redis.get(`room:${roomId}`)

}

export const getAllRooms = async () => {
  const roomIds = await redis.sMembers(ROOM_KEY);
  const rooms = [];
  for (const roomId of roomIds) {
    const playerCount = await redis.sCard(`roomPlayers${roomId}`);
    rooms.push("players", playerCount);
  }
  return rooms;
}

export const findAvailableRoom = async (): Promise<string | null> => {
  const roomIds = await redis.sMembers(ROOM_KEY);

  for (const roomId of roomIds) {
    const playerCount = await redis.sCard(`roomPlayers${roomId}`);
    if (playerCount < MAX_PLAYERS) {
      return roomId;
    }
  }

  return null;
}

export async function findOrCreateRoom(userId: string, socketId: string, socket: AuthenticatedSocket) {
  let roomId = await findAvailableRoom();

  if (!roomId) {
    roomId = await createRoom();
    console.log(`New room created: ${roomId}`);
  }

  if (userId) {
    console.log(`User ${userId} joined room: ${roomId}`);
    // Optional: add user to roomPlayers set
    await redis.sAdd(`roomPlayers:${roomId}`, userId);
  } else {
    console.warn("User ID is required to join a room.");
  }

  return roomId;
}

export const joinRoom = async (playerId: string, roomId: string) => {
  await redis.sAdd(`roomPlayers:${roomId}`, playerId);
  await redis.set(`playerRoom:${playerId}`, roomId);
}

export const leaveRoom = async (playerId: string) => {
  const roomId = await redis.get(`playerRoom:${playerId}`);
  if (!roomId) return;

  await redis.sRem(`roomPlayer:${roomId}`, playerId);
  await redis.del(`playerRoom:${playerId}`);
}

// ============================================================== 
export const CELL_SIZE = 100;
export type Grid = Map<string, Set<string>>;
export const grid: Grid = new Map();