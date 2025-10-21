// socket.ts
import { io } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL;
console.log("socketurl: ", SOCKET_URL)

const socket = io(SOCKET_URL, {
 withCredentials: true,
});



export default socket;
