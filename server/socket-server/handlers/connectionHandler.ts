// /socket-server/handlers/connectionHandler.ts

import { Server } from "socket.io";
import type { AuthenticatedSocket } from "../../shared/types";
import { handleJoinRoom, handleUpdatePositionAndCamera, handleShoot } from "./events";
import { players } from "../../shared/data";

export const socketConnectionHandler = (io: Server) => (socket: AuthenticatedSocket) => {
  console.log("User connected", socket.id);

  socket.broadcast.emit("newPlayer", { id: socket.id, position: players[socket.id] });

  socket.on("ping-check", (clientTime) => {
    socket.emit("pong-check", clientTime)
  })

  socket.on("joinRoom", (userId) => handleJoinRoom(socket, userId));
  socket.on("updatePositionAndCamera", (position, velocity, cameraDirection) => handleUpdatePositionAndCamera(socket, io, position, velocity, cameraDirection));
  socket.on("shoot", ({ userId, shootObject }) => handleShoot(socket, io, userId, shootObject));
  socket.on("requestForestUpdate", (() => {
    socket.emit('updateForest', { id: socket.id, position: { x: 0, y: 0, z: 0 } });
  }));

  socket.on("sendMessage", ({ roomId, userId, message }) => {
    console.log(`Message from ${userId} in room ${roomId}: ${message}`);
    io.to(roomId).emit("receiveMessage", { userId, message });
  })

  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);
    // cleanup logic
  });

  socket.on('playerWalking', (data) => {
    console.log(`Player walking: ${data.userId}`);
    socket.broadcast.emit('playerWalking', data);
  });
  socket.on('playerStopped', (data) => {
    console.log(`Player stopped: ${data.userId}`);
    socket.broadcast.emit('playerStopped', data);
  });
};

