// /socket-server/handlers/connectionHandler.ts

import { Server } from "socket.io";
import cookie from "cookie";
import type { AuthenticatedSocket } from "../../shared/types";
import { handleJoinRoom, handleShoot } from "../../shared/data";
import { handleUpdatePositionAndCameraUpdate } from "../../shared/data";
import axios from "axios";
import { getRoom, leaveRoom, getPlayer } from "../../shared/data";



export const socketConnectionHandler = (io: Server) => (socket: AuthenticatedSocket) => {


  console.log("User connected", socket.id);

  const rawCookie = socket.handshake.headers.cookie;

  if (!rawCookie) {
    console.log("🚫 No cookies sent with socket handshake.");
    // socket.disconnect();
    // return;
  }

  async function validateSession(sessionId: string) {
    const response = await axios.get("http://localhost:3001/auth/me", {
      headers: {
        Cookie: `session_id=${sessionId}`,
      },
    });

    return response.data; // or response.data.user if it’s nested
  }


  // const cookies = cookie.parse(rawCookie);
  // console.log("cookies: ", cookies);
  // const sessionId = cookies["session_id"];
  // console.log("Session iD: ", sessionId)

  // if (sessionId) {
  //   validateSession(sessionId)
  //     .then((user) => {
  //       socket.user = user;
  //       console.log("User validated:", user);

  //     })
  //     .catch((error) => {
  //       console.error("Error validating session:", error);
  //     });
  // } else {
  //   console.warn("No session ID provided. Disconnecting.");
  // socket.disconnect();
  // }

  getPlayer(socket.id).then(data => {
    socket.broadcast.emit("newPlayer", { id: socket.id, position: data?.position });
  })
  .catch(err => {
    console.log("Error getting player: ", err);
  })

  

  socket.on("ping-check", (clientTime) => {
    socket.emit("pong-check", clientTime)
  })

  socket.on("joinRoom", (userId) => handleJoinRoom(userId, socket));
  socket.on("updatePositionAndCamera", (position, velocity, cameraDirection) => handleUpdatePositionAndCameraUpdate(socket, io, position, velocity, cameraDirection));
  socket.on("shoot", ({ userId, shootObject }) => handleShoot(socket, io, userId, shootObject));


  socket.on("requestVegetationPositions", ({ roomId }) => {
    getRoom(roomId, socket);
  });

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

