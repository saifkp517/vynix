// socket.ts
import { io } from "socket.io-client";


// const devSocket = io("http://localhost:4000", {
//   withCredentials: true,
// });


const prodSocket = io("https://debate-quite-artistic-arms.trycloudflare.com", {
  withCredentials: true,
});

const socket = prodSocket;

export default socket;
