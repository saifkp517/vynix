// socket.ts
import { io } from "socket.io-client";

const socket = io("https://afternoon-charging-florist-laptops.trycloudflare.com/", {
    withCredentials: true,
});

export default socket;
