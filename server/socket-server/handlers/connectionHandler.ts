// /socket-server/handlers/connectionHandler.ts

import { Server } from "socket.io";
import cookie from "cookie";
import type { AuthenticatedSocket } from "../../shared/types";
import { handleJoinRoom, handleUpdatePositionAndCamera, handleShoot } from "./events";
import { players } from "../../shared/data";
import { rooms } from "../../shared/data";
import axios from "axios";


export const socketConnectionHandler = (io: Server) => (socket: AuthenticatedSocket) => {


  console.log("User connected", socket.id);

  const rawCookie = socket.handshake.headers.cookie;

  if (!rawCookie) {
    console.log("🚫 No cookies sent with socket handshake.");
    // socket.disconnect();
    return;
  }

  async function validateSession(sessionId: string) {
    const response = await axios.get("http://localhost:3001/auth/me", {
      headers: {
        Cookie: `session_id=${sessionId}`,
      },
    });

    return response.data; // or response.data.user if it’s nested
  }


  const cookies = cookie.parse(rawCookie);
  console.log("cookies: ", cookies);
  const sessionId = cookies["session_id"];
  console.log("Session iD: ", sessionId)

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

  socket.broadcast.emit("newPlayer", { id: socket.id, position: players[socket.id] });

  socket.on("ping-check", (clientTime) => {
    socket.emit("pong-check", clientTime)
  })

  socket.on("joinRoom", (userId) => handleJoinRoom(socket, userId));
  socket.on("updatePositionAndCamera", (position, velocity, cameraDirection) => handleUpdatePositionAndCamera(socket, io, position, velocity, cameraDirection));
  socket.on("shoot", ({ userId, shootObject }) => handleShoot(socket, io, userId, shootObject));


  socket.on("requestVegetationPositions", ({ roomId }) => {
    const room = rooms.find(r => r.id === roomId);
    if (room) {
      socket.emit("receiveVegetationPositions", {
        roomId,
        vegetationPositions: room.vegetationPositions,
      });
    }
  });

  socket.on("sendMessage", ({ roomId, userId, message }) => {
    console.log(`Message from ${userId} in room ${roomId}: ${message}`);
    io.to(roomId).emit("receiveMessage", { userId, message });
  })

  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);

    for (const room of rooms) {
      console.log("Checking room", room.id, "for socket", socket.id);
      console.log("Room players:", room.players.map(p => ({ id: p.id })));

      const playerIndex = room.players.findIndex(player => player.id === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);

        // Remove player from players map
        delete players[socket.id];
        console.log(`Player ${socket.id} removed from room ${room.id}`);
        console.log(rooms.map(r => ({ roomId: r.id, playerIds: r.players.map(p => p.id) })));


        break;
      }
    }

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

