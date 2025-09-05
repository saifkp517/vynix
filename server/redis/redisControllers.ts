import { Vector3 } from "three";
import type { AuthenticatedSocket, Player, ShootObject } from "./types";
import { PrismaClient } from "@prisma/client";
import { Server } from "socket.io";
import { MAX, v4 as uuidv4 } from "uuid"
import { redis } from "./redisClient";

import { getCellKey, broadcastToNearbyPlayers, generateTreePositions, rayIntersectsSphere } from "./utils";
import { createBrotliDecompress } from "zlib";

export const CELL_SIZE = 100;
export type Grid = Map<string, Set<string>>;
export const grid: Grid = new Map();

const prisma = new PrismaClient();

export const allowedOrigins = [
  "http://localhost:3000",
  "https://vynix-kohl.vercel.app",
];

// ================== SHARED PLAYERS ============================ 

const PLAYER_KEY = 'player';
export const setPlayer = async (id: string, player: Player) => {
  await redis.hSet(PLAYER_KEY, id, JSON.stringify(player));
}

export const getPlayer = async (id: string): Promise<Player | null> => {
  const data = await redis.hGet(PLAYER_KEY, id);
  if (!data) return null;

  const parsed = JSON.parse(data);
  return {
    ...parsed,
    position: new Vector3(parsed.position.x, parsed.position.y, parsed.position.z),
    velocity: new Vector3(parsed.velocity.x, parsed.velocity.y, parsed.velocity.z)
  };
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
  await redis.hDel(`${PLAYER_KEY}:${id}`, id);
};


// ============================================================== 



// ================== SHARED ROOMS ============================ 


//rooms is an array of room ids and roomPlayers is a set of player ids

const ROOM_KEY = 'rooms';
const WAITING_POOL_KEY = "waitPool";
const MIN_PLAYERS_TO_START = 1;
const MAX_PLAYERS = 50;

export const createRoom = async (socket: AuthenticatedSocket): Promise<string> => {
  const roomId = uuidv4();

  await redis.sAdd(ROOM_KEY, roomId);
  //game over room deletion logic

  const GAME_DURATION = 60 * 1000;


  setTimeout(async () => {

    try {
      const playerIds = await redis.sMembers(`roomPlayers:${roomId}`);

      for (const playerId of playerIds) {
        const player = await getPlayer(playerId);

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

      socket.to(roomId).emit("gameOver");

      await redis.sRem(ROOM_KEY, roomId);
      await redis.del(`roomPlayers:${roomId}`);

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
    if (playerCount < MAX_PLAYERS) {
      return roomId;
    }
  }

  return null;
}


export const handleMatchmaking = async (socket: AuthenticatedSocket, io: Server) => {
  await redis.sAdd(WAITING_POOL_KEY, socket.id);

  let roomId = await findAvailableRoom();
  if (!roomId) {
    console.log("no room")
    roomId = await createRoom(socket); // return roomId
  }

  const poolCount = await redis.sCard(WAITING_POOL_KEY);

  if (poolCount >= MIN_PLAYERS_TO_START) {
    console.log("poolCount >= MIN_PLAYERS_TO_START")

    const players = await redis.sPopCount(WAITING_POOL_KEY, poolCount);
    console.log(players)

    if (!players) return;

    // Create a new room
    const roomKey = `roomPlayers:${roomId}`;

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


        await setPlayer(playerId, player);
        await redis.set(`playerRoom:${playerId}`, roomId);


        socket.join(roomId);
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




  } else {

    console.log("matchmaking")


    socket.emit("waitingForPlayers", {
      count: poolCount
    });


    return null;

  }
}

export const handleUpdatePositionAndCameraUpdate = async (socket: AuthenticatedSocket, io: Server, position: Vector3, velocity: Vector3, cameraDirection: Vector3) => {

  const userId = socket.id;

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
      userId: socket.userId,
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
            // ================= if player dies =======================

            if (hitPlayer.health <= 0) {

              //userId is attacker
              //playerId is the victim
              hitPlayer.isDead = true;
              io.to(playerId).emit("youDied", { message: "You are dead!" });
              io.to(userId).emit("playerDead", { userId, playerId }); // Notify others

              io.to(hitPlayer.room).emit("playerUpdate", {
                id: hitPlayer.socketId,
                isDead: hitPlayer.isDead,
                health: hitPlayer.health
              })


              //respawn after 5 seconds

              setTimeout(async () => {
                hitPlayer.isDead = false;
                hitPlayer.health = 100;

                io.to(hitPlayer.room).emit("playerUpdate", {
                  id: hitPlayer.socketId,
                  isDead: hitPlayer.isDead,
                  health: hitPlayer.health
                })

                await setPlayer(playerId, hitPlayer);

              }, 5000);
            } else {
              console.log("Before hit:", hitPlayer.health);
              hitPlayer.health -= 10;
              console.log("After hit:", hitPlayer.health);
              await setPlayer(playerId, hitPlayer);
            }

            io.to(hitPlayer.room).emit("playerUpdate", {
              id: hitPlayer.socketId,
              isDead: hitPlayer.isDead,
              health: hitPlayer.health
            })


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

  await redis.sRem(`roomPlayers:${roomId}`, playerId); // Fixed: added 's'
  await redis.del(`playerRoom:${playerId}`);
  await deletePlayer(playerId); // Also remove from main player hash
}
// ============================================================== 