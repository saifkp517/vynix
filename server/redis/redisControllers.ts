import { Vector2, Vector3 } from "three";
import type { AuthenticatedSocket, Player, ShootObject } from "./types";
import { PrismaClient } from "@prisma/client";
import { Server } from "socket.io";
import { MAX, v4 as uuidv4 } from "uuid"

import { redis } from "./redisClient";

import { getCellKey, broadcastToNearbyPlayers, generateTreePositions, rayIntersectsSphere, getRandomPosition } from "./utils";

import { PLAYER_RADIUS } from "./types";
import { socketConnectionHandler } from "../socket-server/handlers/connectionHandler";
import { idText } from "typescript";


export const CELL_SIZE = 200;
export type Grid = Map<string, Set<string>>;
export const grid: Grid = new Map();

const prisma = new PrismaClient();

export const allowedOrigins = [
  "http://localhost:3000",
  "https://vynix-kohl.vercel.app",
];

function distance3D(a: Vector3, b: Vector3) {
  return Math.sqrt(
    (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z)
  )
}

function randomSpawnPoint(bounds: any) {
  return new Vector3(
    Math.random() * (bounds.maxX - bounds.minX) + bounds.minX,
    0, // y fixed at ground
    Math.random() * (bounds.maxZ - bounds.minZ) + bounds.minZ
  );
}

async function getSafeSpawnLocation(roomId: string) {

  const bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };

  const roomPlayers = await getAllPlayersFromRoom(roomId);

  const otherPlayerList = Object.values(roomPlayers);

  const MIN_DISTANCE = 50;
  const MAX_DISTANCE = 100;
  const MAX_ATTEMPTS = 30;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const candidate = randomSpawnPoint(bounds);

    let safe = true;

    for (const player of otherPlayerList) {
      const dist = distance3D(candidate, player.position)
      if (dist > MIN_DISTANCE && dist < MAX_DISTANCE) {
        safe = false;
        break;
      }
    }

    if (safe) return candidate;
  }

  return randomSpawnPoint(bounds);
}

// ================== SHARED PLAYERS ============================ 

const ONLINE_PLAYERS_KEY = 'onlinePlayers';
export const getRoomKey = (roomId: string) => `roomPlayers:${roomId}`; // set

export const getAllOnlinePlayers = async () => {
  return await redis.lLen(ONLINE_PLAYERS_KEY);
}

export const setOnlinePlayer = async (playerSocketId: string) => {
  await redis.lPush(ONLINE_PLAYERS_KEY, playerSocketId);
}

export const setPlayerInRoom = async (
  socket: AuthenticatedSocket,
  roomId: string,
) => {
  // 1. Add userId to the room set
  await redis.sAdd(getRoomKey(roomId), socket.id);

  const spawnPoint = await getSafeSpawnLocation(roomId);

  // 2. Prepare player data (strings only!)
  const redisPlayer = {
    socketId: socket.id,
    userId: socket.userId,
    room: roomId,
    position: JSON.stringify(spawnPoint),  // stringify Vector3
    velocity: JSON.stringify(new Vector3(0, 0, 0)),
    cameraDirection: JSON.stringify(new Vector3(0, 0, 0)),
    username: socket.username,
    isDead: "false",   // store as string
    kills: "0",
    deaths: "0",
    health: "100",
  };

  // 3. Store as a hash
  await redis.hSet(`player:${roomId}:${socket.id}`, redisPlayer);

  // 4. Join socket.io room
  socket.join(roomId);

  socket.emit("spawnPoint", spawnPoint)

  console.log("joined room")
};

export const updatePlayerInRoom = async (
  roomId: string,
  socketId: string,
  updates: Partial<Player>
): Promise<void> => {
  const key = `player:${roomId}:${socketId}`;

  // Convert fields into strings (since Redis stores strings only)
  const redisUpdates: Record<string, string> = {};

  for (const [field, value] of Object.entries(updates)) {
    if (value === undefined) continue;

    if (
      field === "position" ||
      field === "velocity" ||
      field === "cameraDirection"
    ) {
      redisUpdates[field] = JSON.stringify(value); // Vector3
    } else if (typeof value === "boolean") {
      redisUpdates[field] = value ? "true" : "false";
    } else {
      redisUpdates[field] = String(value);
    }
  }

  if (Object.keys(redisUpdates).length > 0) {
    await redis.hSet(key, redisUpdates);
  }
};


export const getPlayerFromRoom = async (
  roomId: string,
  socketId: string
): Promise<Player | null> => {
  const key = `player:${roomId}:${socketId}`;
  const data = await redis.hGetAll(key);

  if (!data || Object.keys(data).length === 0) {
    return null; // player not found
  }

  const pos = JSON.parse(data.position);
  const vel = JSON.parse(data.velocity);
  const cam = JSON.parse(data.cameraDirection);

  return {
    socketId: data.socketId,
    userId: data.userId,
    room: data.room,
    position: new Vector3(pos.x, pos.y, pos.z),
    velocity: new Vector3(vel.x, vel.y, vel.z),
    cameraDirection: new Vector3(cam.x, cam.y, cam.z),
    username: data.username,
    isDead: data.isDead === "true",
    kills: Number(data.kills),
    deaths: Number(data.deaths),
    health: Number(data.health),
  };
};

export const getAllPlayersFromRoom = async (roomId: string): Promise<Record<string, Player>> => {
  const players: Record<string, Player> = {};

  const roomPlayerIds = await redis.sMembers(getRoomKey(roomId));
  for (const socketId of roomPlayerIds) {
    const player = await getPlayerFromRoom(roomId, socketId);
    if (player) {
      players[socketId] = player
    }
  }

  return players;

};

export const deleteOnlinePlayer = async (id: string) => {
  await redis.lPop(ONLINE_PLAYERS_KEY);
};


// ============================================================== 



// ================== SHARED ROOMS ============================ 


//rooms is an array of room ids and roomPlayers is a set of player ids

const ROOM_KEY = 'rooms';
const WAITING_POOL_KEY = "waitPool";
const MIN_PLAYERS_TO_START = 2;
const MAX_PLAYERS = 50;

export const createRoom = async (socket: AuthenticatedSocket, io: Server): Promise<string> => {
  const roomId = uuidv4();

  await redis.sAdd(ROOM_KEY, roomId);
  //game over room deletion logic

  const GAME_DURATION = 10 * 60 * 1000;


  setTimeout(async () => {

    try {
      const playerIds = await redis.sMembers(`roomPlayers:${roomId}`);

      for (const playerId of playerIds) {
        const player = await getPlayerFromRoom(roomId, playerId);

        if (player) {

          if (!player.userId.startsWith("guest-")) {
            await prisma.user.update({
              where: { id: player.userId },
              data: {
                totalKills: { increment: player.kills },
                totalDeaths: { increment: player.deaths },
                totalMatches: { increment: 1 }
              }
            })
          }
        }
      }



      io.to(roomId).emit("gameOver");

      await redis.sRem(ROOM_KEY, roomId);
      await redis.del(`roomPlayers:${roomId}`);
      socket.leave(roomId);

      console.log("gameOver");

    } catch (err) {
      console.log(err)
    }
  }, GAME_DURATION);

  return roomId;
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
    if (playerCount < MAX_PLAYERS && playerCount >= 2) {
      return roomId;
    }
  }

  return null;
}

export const cancelMatchmaking = async (socket: AuthenticatedSocket, io: Server) => {
  await redis.sRem(WAITING_POOL_KEY, socket.id);
  socket.emit("cancelledMatchmaking");
}


export const handleMatchmaking = async (socket: AuthenticatedSocket, io: Server, updatedUsername: string) => {
  console.log("called")

  if(updatedUsername.trim() !== "") {
socket.username = updatedUsername;
console.log("updated username: ", socket.username)
  }
  
  
  socket.emit("searchingForMatch");
  let roomId = await findAvailableRoom();

  if (roomId) {

    console.log("foudn room")

    const player: Player = {
      socketId: socket.id,
      userId: socket.userId,
      room: roomId,
      position: new Vector3(0, 0, 0),
      velocity: new Vector3(0, 0, 0),
      cameraDirection: new Vector3(0, 0, 0),
      username: socket.username,
      isDead: false,
      kills: 0,
      deaths: 0,
      health: 100,
    }

    await setOnlinePlayer(player.socketId);
    await setPlayerInRoom(socket, roomId);

    const roomPlayers = await getAllPlayersFromRoom(roomId);
    if (roomPlayers) {
      socket.emit('roomSnapshot', { roomPlayers })
    }
    socket.emit('roomAssigned', { roomId });

    // const memberIds = await redis.sMembers(roomKey); // only this room's players
    // const playersArray = await Promise.all(memberIds.map(async (id) => {
    //   const p = await getPlayer(id);
    //   // getPlayer returns Player | null — filter nulls later
    //   return p;
    // }));

    // const snapshot = playersArray.filter(Boolean);
    // io.to(socket.id).emit('roomSnapshot', snapshot);

    socket.to(roomId).emit('playerJoined', {
      id: socket.id,
      username: socket.username,
      position: new Vector3(0, 0, 0),
      velocity: new Vector3(0, 0, 0),
      health: 100,
      kills: 0,
      deaths: 0,
      isDead: false,
    });

  } else {

    console.log("in matchmaking")

    await redis.sAdd(WAITING_POOL_KEY, socket.id);
    const playerPoolCount = await redis.sCard(WAITING_POOL_KEY)
    socket.broadcast.emit("playerPoolCount", playerPoolCount)

    let roomId = await createRoom(socket, io); // return roomId
    const roomKey = `roomPlayers:${roomId}`;

    const poolCount = await redis.sCard(WAITING_POOL_KEY);

    if (poolCount >= MIN_PLAYERS_TO_START) {
      console.log("poolCount >= MIN_PLAYERS_TO_START")

      const players = await redis.sPopCount(WAITING_POOL_KEY, poolCount);
      console.log(players)

      if (!players) return;

      // Create a new room

      // Store them in Redis under that room
      await redis.sAdd(roomKey, players);

      // Move sockets into the room
      players.forEach(async (playerId) => {
        const socket = io.sockets.sockets.get(playerId) as AuthenticatedSocket; // if playerId = socket.id
        if (socket) {
          //set player globally

          const player: Player = {
            socketId: playerId,
            userId: socket.userId,
            room: roomId,
            position: new Vector3(0, 0, 0),
            velocity: new Vector3(0, 0, 0),
            cameraDirection: new Vector3(0, 0, 0),
            username: socket.username,
            isDead: false,
            kills: 0,
            deaths: 0,
            health: 100,
          }


          await setOnlinePlayer(playerId);
          await setPlayerInRoom(socket, roomId);

          const roomPlayers = await getAllPlayersFromRoom(roomId);
          if (roomPlayers) {
            socket.emit('roomSnapshot', { roomPlayers })
          }
          socket.emit('roomAssigned', { roomId });

          socket.to(roomId).emit('playerJoined', {
            id: playerId,
            username: socket.username,
            position: player.position,
            velocity: player.velocity,
            health: player.health,
            kills: player.kills,
            deaths: player.deaths,
            isDead: player.isDead
          });



        }
      });

      // const memberIds = await redis.sMembers(roomKey); // only this room's players
      // const playersArray = await Promise.all(memberIds.map(async (id) => {
      //   const p = await getPlayer(id);
      //   // getPlayer returns Player | null — filter nulls later
      //   return p;
      // }));

      // // filter out any nulls and emit snapshot to everyone in the room
      // const snapshot = playersArray.filter(Boolean);
      // io.to(socket.id).emit('roomSnapshot', snapshot);




    } else {

      console.log("matchmaking")


      socket.emit("waitingForPlayers", {
        count: poolCount
      });


      return null;

    }
  }


}

export const handleUpdatePositionAndCameraUpdate = async (socket: AuthenticatedSocket, io: Server, roomId: string, position: Vector3, velocity: Vector3, cameraDirection: Vector3) => {

  const player = await getPlayerFromRoom(roomId, socket.id);
  if (!player) return;

  await updatePlayerInRoom(roomId, socket.id, {
    position,
    velocity,
    cameraDirection
  })


  const cellKey = getCellKey(position);

  //remove player from old cell
  for (const [key, set] of grid.entries()) {
    if (set.has(socket.id)) set.delete(socket.id);
  }

  //add player to new cell
  if (!grid.has(cellKey)) grid.set(cellKey, new Set());
  grid.get(cellKey)?.add(socket.id);

  broadcastToNearbyPlayers(socket, cellKey, {
    event: 'playerMoved',
    payload: {
      id: socket.id,
      userId: socket.userId,
      username: socket.username,
      position,
      velocity,
      cameraDirection,
    },
  }, io);

}

export const handleShoot = async (socket: AuthenticatedSocket, io: Server, userId: string, shootObject: ShootObject, roomId: string) => {
  const players = await getAllPlayersFromRoom(roomId);

  if (players) {
    for (const [playerId, player] of Object.entries(players)) {
      if (playerId === userId) continue; // Skip the shooter

      const rayOrigin = new Vector3(
        shootObject.rayOrigin.x,
        shootObject.rayOrigin.y,
        shootObject.rayOrigin.z
      );
      const rayDirection = new Vector3(
        shootObject.rayDirection.x,
        shootObject.rayDirection.y,
        shootObject.rayDirection.z
      ).normalize();

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

      const { hit, distance } = rayIntersectsSphere(rayOrigin, rayDirection, playerCenter, PLAYER_RADIUS);

      console.log(`[Check] playerId: ${playerId}, hit: ${hit}, distance: ${distance.toFixed(3)} units`);

      if (hit) {
        console.log(`--> User-id(${playerId}) is hit!`);
        io.to(playerId).emit("hit", { rayOrigin });

        const key = `player:${roomId}:${playerId}`;

        // Apply damage atomically
        await redis.hIncrBy(key, 'health', -10);

        const newHealthStr = await redis.hGet(key, 'health');
        const newHealth = Number(newHealthStr);

        if (newHealth > 0) {
          // Non-fatal hit: Optionally emit health update here if needed
          // io.to(roomId).emit("playerUpdate", { id: playerId, health: newHealth });
          continue;
        }

        // Potential death: Use WATCH for atomic check-and-set
        let attempts = 0;
        let killed = false;
        while (attempts < 3 && !killed) { // Retry up to 3 times on conflict
          await redis.watch(key);

          const isDeadStr = await redis.hGet(key, 'isDead');
          const isDead = isDeadStr === 'true';

          if (isDead) {
            await redis.unwatch();
            break; // Already dead, no need to schedule respawn
          }

          // Not dead: Attempt to kill atomically
          const multi = redis.multi();
          multi.hSet(key, 'isDead', 'true');
          const execResult = await multi.exec();

          if (execResult === null) {
            // Transaction failed (conflict), retry
            attempts++;
            continue;
          }

          // Success: This caller "won" the race
          killed = true;
          await redis.unwatch();

          // Emit death events
          io.to(playerId).emit("youDied", { message: "You are dead!" });
          io.to(roomId).emit("playerDead", { killerSocketId: userId, victimSocketId: playerId, killerName: socket.username, victimName: player.username  });



          // Schedule single background respawn
          setTimeout(async () => {
            // Optional: Re-check state to be safe (e.g., if game ended)
            const currentIsDead = (await redis.hGet(key, 'isDead')) === 'true';
            if (!currentIsDead) return;

            const newPos = await getSafeSpawnLocation(roomId);

            await redis.hSet(key, {
              isDead: 'false',
              health: '100',
              position: JSON.stringify(newPos),
            });

            // Emit respawn to the player (and optionally to room for updates)
            io.to(playerId).emit("spawnPoint", newPos);
            io.to(roomId).emit("playerRespawned", { id: playerId, position: newPos });
          }, 5000);
        }
      } else {
        console.log(`--> User-id(${playerId}) missed by ${distance.toFixed(3)} units`);
      }
    }
  }
};


export const leaveRoom = async (playerId: string, io?: Server) => {
  // Find the room by checking all room player sets
  let roomId: string | null = null;
  const roomIds = await redis.sMembers(ROOM_KEY);
  for (const rId of roomIds) {
    const isMember = await redis.sIsMember(`roomPlayers:${rId}`, playerId);
    if (isMember) {
      roomId = rId;
      break;
    }
  }

  if (!roomId) {
    console.log(`No room found for player ${playerId}`);
    return;
  }

  //Remove from onlinePlayers list
  await redis.lPop(ONLINE_PLAYERS_KEY);

  // Remove from room set
  await redis.sRem(`roomPlayers:${roomId}`, playerId);

  // Delete player data hash
  await redis.del(`player:${roomId}:${playerId}`);

  // Remove from grid
  for (const [key, set] of grid.entries()) {
    if (set.has(playerId)) {
      set.delete(playerId);
      if (set.size === 0) grid.delete(key); // Clean up empty cells
    }
  }

  // Remove from socket.io room and notify others
  if (io) {
    const socket = io.sockets.sockets.get(playerId) as AuthenticatedSocket;
    if (socket) {
      socket.leave(roomId);
      io.to(roomId).emit("playerLeft", { id: playerId });
    }
  }

  console.log(`Player ${playerId} left room ${roomId}`);
};
// ============================================================== 