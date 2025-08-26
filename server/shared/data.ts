import { Vector3 } from "three";
import type { AuthenticatedSocket, Player, ShootObject } from "./types";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid"
import { redis } from "./redisClient";

import { getCellKey, broadcastToNearbyPlayers, generateTreePositions, rayIntersectsSphere } from "./utils";




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
  await redis.sAdd(ROOM_KEY, roomId);

  return roomId;
}

export const getRoom = async (roomId: string, socket: AuthenticatedSocket) => {

  const vegetationPositions = await redis.get(`room:${roomId}:vegetation`);

  socket.emit("recieveVegetationPositions", {
    roomId,
    vegetationPositions
  })

}


export const getAllRooms = async () => {
  const roomIds = await redis.sMembers(ROOM_KEY);
  const rooms = [];
  for (const roomId of roomIds) {
    const playerCount = await redis.sCard(`roomPlayers:${roomId}`);
    rooms.push("players", playerCount);
  }
  return rooms;
}

export const findAvailableRoom = async (): Promise<string | null> => {
  const roomIds = await redis.sMembers(ROOM_KEY);

  for (const roomId of roomIds) {
    const playerCount = await redis.sCard(`roomPlayers:${roomId}`);
    if (playerCount < MAX_PLAYERS) {
      return roomId;
    }
  }

  return null;
}

export const handleJoinRoom = async (playerId: string, socket: AuthenticatedSocket) => {
  let roomId = await findAvailableRoom();

  const rand = () => Math.random() * 100 + 100;

  if (!roomId) {
    roomId = await createRoom();
    console.log(`New room created: ${roomId}`);
  }

  const user = socket.user;

  if (user) {

    console.log(`User ${user.id} joined room: ${roomId}`);

    try {

      socket.join(roomId);

      const player: any = {
        id: user.id,
        username: user.username,
        kills: 0,
        deaths: 0,
        health: 100,
      }

      await redis.sAdd(`roomPlayers:${roomId}`, JSON.stringify(player));


      //set player attributes
      await redis.set(`playerRoom:${user.id}`, roomId);
      await redis.hSet(PLAYER_KEY, user.id, JSON.stringify(player));

      const getPositions = await redis.get(`room:${roomId}:vegetation`);
      const roomPlayersStr = await redis.sMembers(`roomPlayers:${roomId}`)



      if (getPositions) {
        const vegetationPositions = JSON.parse(getPositions)

        socket.emit('roomAssigned', { roomId, vegetationPos: vegetationPositions });
      }

      if (roomPlayersStr) {

        const roomPlayers: Player[] = roomPlayersStr.map((str) => JSON.parse(str));

        socket.emit('roomSnapshot', roomPlayers);

        socket.to(roomId).emit(`playerJoined`, playerId)
      }


    } catch (err) {

      console.log(err)

    }

  } else {
    console.warn("User ID is required to join a room.");
  }

  return roomId;
}

export const handleUpdatePositionAndCameraUpdate = async (socket: AuthenticatedSocket, io: Server, position: Vector3, velocity: Vector3, cameraDirection: Vector3) => {

  const userId = socket.user.id;

  const getPlayer = await redis.hGet(PLAYER_KEY, userId);
  if (!getPlayer) return;

  const player = JSON.parse(getPlayer);

  const updatedPlayer: Player = {
    ...player,
    position,
    velocity,
    cameraDirection
  }

  await redis.hSet(PLAYER_KEY, userId, JSON.stringify(updatedPlayer));


  const cellKey = getCellKey(position);

  //remove player from old cell
  for (const [key, set] of grid.entries()) {
    if (set.has(userId)) set.delete(userId);
  }

  //add player to new cell
  if (!grid.has(cellKey)) grid.set(cellKey, new Set());
  grid.get(cellKey)?.add(userId);

  broadcastToNearbyPlayers(socket, cellKey, {
    event: 'playerMoved',
    payload: {
      id: socket.id,
      user: socket.user,
      position,
      velocity,
      cameraDirection,
    },
  }, io);
}

export const handleShoot = async (socket: AuthenticatedSocket, io: Server, userId: string, shootObject: ShootObject) => {
  const players = await getAllPlayers();

  if (players) {
    Object.entries(players).forEach(async ([playerId, player]) => {
      if (playerId == userId) return; // Skip the current player

      const rayOrigin = new Vector3(
        shootObject.rayOrigin.x,
        shootObject.rayOrigin.y,
        shootObject.rayOrigin.z
      );
      const rayDirection = new Vector3(
        shootObject.rayDirection.x,
        shootObject.rayDirection.y,
        shootObject.rayDirection.z
      ).normalize(); // Always normalize the direction vector


      const playerCenter = new Vector3(
        player.position.x,
        player.position.y - 1.5,
        player.position.z
      );

      const cellKey = getCellKey(rayOrigin);

      broadcastToNearbyPlayers(socket, cellKey, {
        event: 'playerShot',
        payload: {
          id: socket.id,
          rayOrigin,
          rayDirection
        },
      }, io);

      // Try values that are "near" the ray

      const { hit, distance } = rayIntersectsSphere(rayOrigin, rayDirection, playerCenter, 0.5);

      console.log(`[Check] playerId: ${playerId}, hit: ${hit}, distance: ${distance.toFixed(3)} units`);

      if (hit) {
        console.log(`--> User-id(${playerId}) is hit!`);
        io.to(playerId).emit("hit", { rayOrigin })
        // Handle hit logic here, e.g., reduce health, notify players, etc.
        let hitPlayer = players[playerId];
        if (hitPlayer) {
          if (typeof hitPlayer.health === "number") {
            console.log("Before hit:", hitPlayer.health);
            hitPlayer.health -= 10;
            console.log("After hit:", hitPlayer.health);
            hitPlayer.health -= 10; // Reduce health by 10
            if (hitPlayer.health <= 0) {
              io.to(playerId).emit("youDied", { message: "You are dead!" });
              // Handle player death logic here
              io.to(userId).emit("playerDead", { userId, playerId }); // Notify others
              hitPlayer.health = 100;
            }
          }
        }

        await setPlayer(playerId, hitPlayer);

      } else {
        console.log(`--> User-id(${playerId}) missed by ${distance.toFixed(3)} units`);
      }
    })
  }
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