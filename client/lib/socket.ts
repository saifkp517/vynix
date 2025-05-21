// socket.ts
import { io } from "socket.io-client";


// const devSocket = io("http://localhost:4000", {
//    withCredentials: true,
// });

 const prodSocket = io("https://pat-rob-retained-warm.trycloudflare.com", {
     withCredentials: true,
 });

const socket = prodSocket;

export default socket;
