// socket.ts
import { io } from "socket.io-client";


// const socket = io("http://localhost:4000", {
//  withCredentials: true,
// });



 const socket = io("https://registration-serious-ka-repository.trycloudflare.com", {
   withCredentials: true,
 });




export default socket;
