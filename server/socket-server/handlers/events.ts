import { Server } from "socket.io";
import type { AuthenticatedSocket, Player, ShootObject, RayIntersectionResult } from "../../shared/types";
import { Vector3 } from "three";
import { rooms, players, grid } from "../../shared/data";
import { findOrCreateRoom, getCellKey, broadcastToNearbyPlayers, rayIntersectsSphere } from "../../shared/utils";

export const handleJoinRoom = (socket: AuthenticatedSocket, userId: string) => {
  const room = findOrCreateRoom(userId, socket.id, socket);
  socket.join(room.id);

  // Assign a random position between 100 and 200 for x and z
  const rand = () => Math.random() * 100 + 100;
  const startPosition = { x: rand(), y: 0, z: rand() };
  //assign team to player
  const team = Math.random() < 0.5 ? "red" : "blue";

  const newPlayer: Player = {
    id: userId,
    team: team,
    health: 100,
    position: startPosition,
    velocity: { x: 0, y: 0, z: 0 },
    cameraDirection: new Vector3(0, 0, 0)
  }
  room.players.push(newPlayer)
  socket.emit('roomAssigned', { room: room, team });
  console.log(rooms.map(r => ({ roomId: r.id, playerIds: r.players.map(p => p.id) })));
};

let newCenter: Vector3 = new Vector3(0, 0, 0);
const innerRadius = 100;

export const handleUpdatePositionAndCamera = (socket: AuthenticatedSocket, io: Server, position: Vector3, velocity: Vector3, cameraDirection: Vector3) => {
  let distance = Math.sqrt(
    Math.pow(position.x - newCenter.x, 2) +
    Math.pow(position.y - newCenter.y, 2) +
    Math.pow(position.z - newCenter.z, 2)
  );
  if (distance > innerRadius) {
    console.log(position);
    console.log("Player is outside the inner radius, updating position...");
    socket.emit('updateForest', { id: socket.id, position: position });
    newCenter = position;
  }

  const currentHealth = players[socket.id]?.health ?? 100;

  players[socket.id] = {
    id: socket.id,
    position,
    velocity,
    team: "red",
    health: currentHealth,  // Preserve the current health
    cameraDirection
  };

  const cellKey = getCellKey(position);

  //remove player from old cell
  for (const [key, set] of grid.entries()) {
    if (set.has(socket.id)) set.delete(socket.id);
  }

  //add player to new cell
  if (!grid.has(cellKey)) grid.set(cellKey, new Set());
  grid.get(cellKey)?.add(socket.id);

  //broadcast only to players within my grid
  broadcastToNearbyPlayers(socket, cellKey, {
    event: 'playerMoved',
    payload: {
      id: socket.id,
      position,
      velocity,
      cameraDirection,
    },
  }, io);
};

export const handleShoot = (socket: AuthenticatedSocket, io: Server, userId: string, shootObject: ShootObject) => {
  Object.entries(players).forEach(([playerId, player]) => {
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
      player.position.y,
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


    const { hit, distance } = rayIntersectsSphere(rayOrigin, rayDirection, playerCenter, 1.5);

    console.log(`[Check] playerId: ${playerId}, hit: ${hit}, distance: ${distance.toFixed(3)} units`);

    if (hit) {
      console.log(`--> User-id(${playerId}) is hit!`);
      io.to(playerId).emit("hit", { rayOrigin })
      // Handle hit logic here, e.g., reduce health, notify players, etc.
      let hitPlayer = players[playerId];
      if (hitPlayer) {
        if (typeof hitPlayer.health === "number") {
          console.log(hitPlayer.health);
          hitPlayer.health -= 10; // Reduce health by 10
          if (hitPlayer.health <= 0) {
            io.to(playerId).emit("youDied", { message: "You are dead!" });
            // Handle player death logic here
            io.to(userId).emit("playerDead", { userId, playerId }); // Notify others
            hitPlayer.health = 100;
          }
        }
      }

    } else {
      console.log(`--> User-id(${playerId}) missed by ${distance.toFixed(3)} units`);
    }
  })
};
