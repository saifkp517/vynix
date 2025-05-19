// socket.ts
import { io } from "socket.io-client";

const socket = io("https://upload-delivering-wildlife-cartridge.trycloudflare.com", {
    withCredentials: true,
});

export default socket;
