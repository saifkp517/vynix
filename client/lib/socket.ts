// socket.ts
import { io } from "socket.io-client";

const socket = io(process.env.DOMAIN_URL || "http://localhost:4000");

export default socket;
