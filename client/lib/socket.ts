// socket.ts
import { io } from "socket.io-client";

console.log("Connecting to socket server at: ", process.env.DOMAIN_URL);
const socket = io(process.env.DOMAIN_URL);

export default socket;
