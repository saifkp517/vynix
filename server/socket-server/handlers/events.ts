import { Server } from "socket.io";
import type { AuthenticatedSocket, Player } from "../../shared/types";
import { Vector3 } from "three";
import { rooms, players, grid } from "../../shared/data";
import { findOrCreateRoom, getCellKey, getNearbyPlayers } from "../../shared/utils";

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
    velocity: { x: 0, y: 0, z: 0 }
  }
  room.players.push(newPlayer)
  socket.emit('roomAssigned', { room: room, team });
  console.log(rooms.map(r => ({ roomId: r.id, playerIds: r.players.map(p => p.id) })));
};

let newCenter: Vector3 = new Vector3(0, 0, 0);
const innerRadius = 100;

export const handleUpdatePosition = (socket: AuthenticatedSocket, io: Server, position: any, velocity: any) => {
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
    position,
    velocity,
    team: "red",
    health: currentHealth  // Preserve the current health
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
  const nearbySocketIds = getNearbyPlayers(socket, cellKey);
  for (const id of nearbySocketIds) {
    io.to(id).emit('playerMoved', { id: socket.id, position, velocity });
  }
};

export const handleShoot = (socket: AuthenticatedSocket, io: Server, data: any) => {
  // TODO: implement shooting logic
};
