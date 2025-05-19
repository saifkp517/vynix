// socket.ts
import { io } from "socket.io-client";

const socket = io("https://monitor-setup-preceding-name.trycloudflare.com");

export default socket;
