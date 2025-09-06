// /socket-server/handlers/connectionHandler.ts

import { Server } from "socket.io";
import cookie from "cookie";
import type { AuthenticatedSocket } from "../../redis/types";
import { handleMatchmaking, cancelMatchmaking, handleShoot } from "../../redis/redisControllers";
import { handleUpdatePositionAndCameraUpdate } from "../../redis/redisControllers";
import axios from "axios";
import { leaveRoom } from "../../redis/redisControllers";
import { v4 as uuidv4 } from "uuid";
import { assign } from "three/tsl";


function assignGuest(socket: AuthenticatedSocket) {
  socket.userId = `guest-${uuidv4()}`;
  socket.username = `Guest_${Math.floor(Math.random() * 10000)}`;
  console.log("👤 Guest connected:", socket.username);
  socket.emit("userId", socket.userId);
}


export const socketConnectionHandler = (io: Server) => (socket: AuthenticatedSocket) => {


  console.log("User connected", socket.id);

  const rawCookie = socket.handshake.headers.cookie;

  if (rawCookie) {

    const cookies = cookie.parse(rawCookie);
    console.log("cookies: ", cookies);
    const sessionId = cookies["session_id"];
    console.log("Session iD: ", sessionId)


    if (sessionId) {
      validateSession(sessionId)
        .then((user) => {
          socket.userId = user.id;
          socket.username = user.username;
          console.log("User validated:", user);
          socket.emit("userId", user.id);
        })
        .catch((error) => {
          console.error("Error validating session:", error);
          assignGuest(socket);
        });
        return;
    }
  }

  assignGuest(socket);

  async function validateSession(sessionId: string) {
    const response = await axios.get("http://localhost:3001/auth/me", {
      headers: {
        Cookie: `session_id=${sessionId}`,
      },
    });

    return response.data; // or response.data.user if it’s nested
  }








  socket.on("ping-check", (clientTime) => {
    socket.emit("pong-check", clientTime)
  })

  socket.on("requestMatchmaking", (userId) => handleMatchmaking(socket, io));
  socket.on("cancelMatchmaking", () => cancelMatchmaking)
  socket.on("updatePositionAndCamera", (position, velocity, cameraDirection) => handleUpdatePositionAndCameraUpdate(socket, io, position, velocity, cameraDirection));
  socket.on("shoot", ({ userId, shootObject }) => handleShoot(socket, io, userId, shootObject));

  socket.on("sendMessage", ({ roomId, userId, message }) => {
    console.log(`Message from ${userId} in room ${roomId}: ${message}`);
    io.to(roomId).emit("receiveMessage", { userId, message });
  })

  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);

    leaveRoom(socket.id);

    io.emit('playerDisconnected', socket.id);
  });

  socket.on('playerWalking', ({ userId }) => {
    console.log(`Player walking: ${userId}`);
    socket.broadcast.emit('playerWalking', { userId });
  });
  socket.on('playerStopped', ({ userId }) => {
    console.log(`Player stopped: ${userId}`);
    socket.broadcast.emit('playerStopped', { userId });
  });
};

