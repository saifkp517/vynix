import { Server } from "socket.io";
import type { AuthenticatedSocket, Player, ShootObject, RayIntersectionResult } from "../../shared/types";
import { Vector3 } from "three";
import { grid, findOrCreateRoom } from "../../shared/data";

import {getCellKey, broadcastToNearbyPlayers, rayIntersectsSphere } from "../../shared/utils";

export const handleJoinRoom = (socket: AuthenticatedSocket, userId: string) => {
  const roomId = findOrCreateRoom(userId, socket);
  return roomId;
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
