// socket.ts
import { io } from "socket.io-client";

const socket = io("https://attorneys-hook-education-directions.trycloudflare.com", {
    withCredentials: true,
});

export default socket;
