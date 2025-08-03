import { Vector3 } from "three";
import type { AuthenticatedSocket, Player } from "./types";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid"
import { redis } from "./redisClient";


import { getCellKey, broadcastToNearbyPlayers, generateTreePositions } from "./utils";




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

export const getRoom = async (roomId: string, socket: AuthenticatedSocket) => {

  const vegetationPositions = await redis.get(`room:${roomId}:vegetation`);
  const roomPlayers = await redis.get(`room:${roomId}:players`)

  socket.emit("recieveVegetationPositions", {
    roomId,
    vegetationPositions
  })

}

export const getAllRooms = async () => {
  const roomIds = await redis.sMembers(ROOM_KEY);
  const rooms = [];
  for (const roomId of roomIds) {
    const playerCount = await redis.sCard(`room:${roomId}:players`);
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

export const findOrCreateRoom = async (playerId: string, socket: AuthenticatedSocket) => {
  let roomId = await findAvailableRoom();

  const rand = () => Math.random() * 100 + 100;
  const startPosition = { x: rand(), y: 0, z: rand() };

  if (!roomId) {
    roomId = await createRoom();
    console.log(`New room created: ${roomId}`);
  }

  if (playerId) {

    console.log(`User ${playerId} joined room: ${roomId}`);

    try {
      await redis.sAdd(`roomPlayers:${roomId}`, playerId);

      //set player attributes
      await redis.set(`playerRoom:${playerId}`, roomId);
      await redis.set(`playerHealth:${playerId}`, 100);
      await redis.set(`playerPosition:${playerId}`, JSON.stringify(startPosition));
      await redis.set(`playerVelocity:${playerId}`, JSON.stringify(new Vector3(0, 0, 0)));
      await redis.set(`playerCameraDirection:${playerId}`, JSON.stringify(new Vector3(0, 0, 0)));


      socket.join(roomId);
      socket.emit('roomAssigned', { room: roomId });

    } catch (err) {

      console.log(err)

    }

  } else {
    console.warn("User ID is required to join a room.");
  }

  return roomId;
}

export const handleUpdatePositionAndCameraUpdate = async (socket: AuthenticatedSocket, io: Server, position: Vector3, velocity: Vector3, cameraDirection: Vector3) => {

  const playerId = socket.id;


  const updatePosition = await redis.set(`playerPosition:${playerId}`, JSON.stringify(position))
  const updateVelocity = await redis.set(`playerVelocity:${playerId}`, JSON.stringify(velocity))
  const updateCamerDir = await redis.set(`playerCameraDirection:${playerId}`, JSON.stringify(cameraDirection))


  const cellKey = getCellKey(position);

  //remove player from old cell
  for (const [key, set] of grid.entries()) {
    if (set.has(playerId)) set.delete(playerId);
  }

  //add player to new cell
  if (!grid.has(cellKey)) grid.set(cellKey, new Set());
  grid.get(cellKey)?.add(playerId);

  broadcastToNearbyPlayers(socket, cellKey, {
    event: 'playerMoved',
    payload: {
      id: socket.id,
      position,
      velocity,
      cameraDirection,
    },
  }, io);
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