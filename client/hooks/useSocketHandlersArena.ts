import { useEffect } from "react";
import { useRoomStore, Player } from "./useRoomStore";

// Hook expects the socket and the setter functions you already use
export function useSocketHandlers(
  socket: any,
  {
    setMatchmakingStatus,
    setIsMatchmaking,
    redirect,
  }: {
    setMatchmakingStatus: (status: string) => void;
    setIsMatchmaking: (val: boolean) => void;
    redirect: (path: string) => void;
  }
) {
 //Handlers

    const handleGameOver = (killerId: string, victimId: string) => {
        
    }

  // Effect for socket events
  useEffect(() => {
    if (!socket) return;

    

    return () => {
    };
  }, [socket]);
}
