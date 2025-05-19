// socket.ts
import { io } from "socket.io-client";

const socket = io("https://adapted-retirement-motel-computer.trycloudflare.com/", {
    withCredentials: true,
});

export default socket;
