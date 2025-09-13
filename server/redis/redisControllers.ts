import { Vector2, Vector3 } from "three";
import type { AuthenticatedSocket, Player, ShootObject } from "./types";
import { PrismaClient } from "@prisma/client";
import { Server } from "socket.io";
import { MAX, v4 as uuidv4 } from "uuid"

import { redis } from "./redisClient";

import { getCellKey, broadcastToNearbyPlayers, generateTreePositions, rayIntersectsSphere } from "./utils";

import { PLAYER_RADIUS } from "./types";
import { socketConnectionHandler } from "../socket-server/handlers/connectionHandler";
import { idText } from "typescript";


export const CELL_SIZE = 100;
export type Grid = Map<string, Set<string>>;
export const grid: Grid = new Map();

const prisma = new PrismaClient();

export const allowedOrigins = [
  "http://localhost:3000",
  "https://vynix-kohl.vercel.app",
];

// ================== SHARED PLAYERS ============================ 

const ONLINE_PLAYERS_KEY = 'onlinePlayers';
export const getRoomKey = (roomId: string) => `roomPlayers:${roomId}`; // set

export const setOnlinePlayer = async (playerSocketId: string) => {
  await redis.lPush(ONLINE_PLAYERS_KEY, playerSocketId);
}

export const setPlayerInRoom = async (
  socket: AuthenticatedSocket,
  roomId: string,
  player: Player
) => {
  // 1. Add userId to the room set
  await redis.sAdd(getRoomKey(roomId), player.socketId);

  // 2. Prepare player data (strings only!)
  const redisPlayer = {
    socketId: player.socketId,
    userId: player.userId,
    room: roomId,
    position: JSON.stringify(new Vector3(0, 0, 0)),  // stringify Vector3
    velocity: JSON.stringify(new Vector3(0, 0, 0)),
    cameraDirection: JSON.stringify(new Vector3(0, 0, 0)),
    username: socket.username,
    isDead: "false",   // store as string
    kills: "0",
    deaths: "0",
    health: "100",
  };

  // 3. Store as a hash
  await redis.hSet(`player:${roomId}:${player.socketId}`, redisPlayer);

  // 4. Join socket.io room
  socket.join(roomId);

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
    if (playerCount < MAX_PLAYERS && playerCount !== 0) {
      return roomId;
    }
  }

  return null;
}

export const cancelMatchmaking = async (socket: AuthenticatedSocket, io: Server) => {
  await redis.sRem(WAITING_POOL_KEY, socket.id);
  socket.emit("cancelledMatchmaking");
}

export const handleMatchmaking = async (socket: AuthenticatedSocket, io: Server) => {

  let roomId = await findAvailableRoom();

  const roomKey = `roomPlayers:${roomId}`;

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
    await setPlayerInRoom(socket, roomId, player);
    const roomPlayers = await getAllPlayersFromRoom(roomId);
    if(roomPlayers) {
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

    let roomId = await createRoom(socket); // return roomId
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
          await setPlayerInRoom(socket, roomId, player);

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
      position,
      velocity,
      cameraDirection,
    },
  }, io);

}

export const handleShoot = async (socket: AuthenticatedSocket, io: Server, userId: string, shootObject: ShootObject, roomId: string) => {
  const players = await getAllPlayersFromRoom(roomId);

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

      const { hit, distance } = rayIntersectsSphere(rayOrigin, rayDirection, playerCenter, PLAYER_RADIUS);

      console.log(`[Check] playerId: ${playerId}, hit: ${hit}, distance: ${distance.toFixed(3)} units`);

      if (hit) {
        console.log(`--> User-id(${playerId}) is hit!`);
        io.to(playerId).emit("hit", { rayOrigin })
        // Handle hit logic here, e.g., reduce health, notify players, etc.
        let hitPlayer = players[playerId];
        if (hitPlayer) {
          if (typeof hitPlayer.health === "number") {
            // ================= if player dies =======================

            if (hitPlayer.health <= 0 && !hitPlayer.isDead) {

              //userId is attacker
              //playerId is the victim
              hitPlayer.isDead = true;
              io.to(playerId).emit("youDied", { message: "You are dead!" });
              io.to(hitPlayer.room).emit("playerDead", { killer: userId, victim: playerId }); // Notify others

              //respawn after 5 seconds

              setTimeout(async () => {
                hitPlayer.isDead = false;
                hitPlayer.health = 100;

                // io.to(hitPlayer.room).emit("playerUpdate", {
                //   id: hitPlayer.socketId,
                //   isDead: hitPlayer.isDead,
                //   health: hitPlayer.health
                // })

              }, 5000);
            } else {
              console.log("Before hit:", hitPlayer.health);
              hitPlayer.health -= 10;
              console.log("After hit:", hitPlayer.health);
            }

            /**
             * commented out cuz currently it's taking too much processing powe
             * would later uncomment if needed to show health enemy bars
             */

            // io.to(hitPlayer.room).emit("playerUpdate", {
            //   id: hitPlayer.socketId,
            //   isDead: hitPlayer.isDead,
            //   health: hitPlayer.health
            // })


          }
        }

        await updatePlayerInRoom(roomId, playerId, hitPlayer);



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
  await deleteOnlinePlayer(playerId); // Also remove from main player hash
}
// ============================================================== 