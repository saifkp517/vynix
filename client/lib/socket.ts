// socket.ts
import { io } from "socket.io-client";


const socket = io("http://localhost:4000", {
  withCredentials: true,
});


// const socket = io("https://pillow-efficient-code-crime.trycloudflare.com", {
//   withCredentials: true,
// });


export default socket;
