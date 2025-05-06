// socket.ts
import { io } from "socket.io-client";

console.log("Connecting to socket server at: ", process.env.DOMAIN_URL);
const socket = io("https://41ef-43-224-131-146.ngrok-free.app");

export default socket;
