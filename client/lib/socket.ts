// socket.ts
import { io } from "socket.io-client";


// const devSocket = io("http://localhost:4000", {
//    withCredentials: true,
// });


 const prodSocket = io("https://dosage-mailto-urban-correspondence.trycloudflare.com", {
     withCredentials: true,
 });

const socket = prodSocket;

export default socket;
