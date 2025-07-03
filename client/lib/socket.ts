// socket.ts
import { io } from "socket.io-client";


//const socket = io("http://localhost:4000", {
 //withCredentials: true,
//});


 const socket = io("https://url-blogs-src-rim.trycloudflare.com", {
   withCredentials: true,
 });




export default socket;
