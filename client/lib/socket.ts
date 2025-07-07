// socket.ts
import { io } from "socket.io-client";


//const socket = io("http://localhost:4000", {
 //withCredentials: true,
//});


 const socket = io("https://strategy-creative-advertisements-mercury.trycloudflare.com", {
   withCredentials: true,
 });




export default socket;
