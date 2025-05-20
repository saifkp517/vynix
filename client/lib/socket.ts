// socket.ts
import { io } from "socket.io-client";


const devSocket = io("http://localhost:4000", {
    withCredentials: true,
});

// const prodSocket = io("https://afternoon-charging-florist-laptops.trycloudflare.com/", {
//     withCredentials: true,
// });

const socket = devSocket;

export default socket;
