// socket.ts
import { io } from "socket.io-client";
import { supabase } from "@/lib/supabase";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL;
console.log("socketurl: ", SOCKET_URL)

const socket = io(SOCKET_URL, {
 withCredentials: true,
 autoConnect: false, // don't connect until we actually have a Supabase session (see page.tsx)
 // Called fresh on every (re)connect attempt, not just once at creation — so a
 // token refreshed mid-session or a just-completed login is always picked up,
 // instead of baking in whatever token existed when this module first loaded.
 auth: async (cb) => {
   const { data } = await supabase.auth.getSession();
   cb({ token: data.session?.access_token });
 },
});



export default socket;
