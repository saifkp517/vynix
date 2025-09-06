// /socket-server/index.ts
import { Server, Socket } from "socket.io";
import { allowedOrigins } from "../redis/redisControllers";
import { createServer } from "http";
import express from "express";
import { socketConnectionHandler } from "./handlers/connectionHandler";

import type { AuthenticatedSocket } from "../redis/types";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});

io.on("connection", (socket) => socketConnectionHandler(io)(socket as AuthenticatedSocket)); 

httpServer.listen(4000, () => console.log("WebSocket server running on port 4000"));

