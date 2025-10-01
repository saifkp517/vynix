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
  // Handlers
  const handleRoomSnapshot = ({ roomPlayers }: { roomPlayers: Record<string, Player> }) => {
    const playersArray = Object.values(roomPlayers);
    console.log("current room players", roomPlayers, playersArray);
    useRoomStore.getState().setPlayers([...playersArray]);
  };

  const confirmMatchmaking = () => {
    setMatchmakingStatus("Matchmaking...");
    setIsMatchmaking(true);
  }

  const handleRoomAssigned = ({ roomId }: { roomId: string }) => {
    setMatchmakingStatus("Match Found!!");
    redirect(`forest/${roomId}`);
  };

  const handleCancelledMatchmaking = () => {
    setMatchmakingStatus("Find Match");
    setIsMatchmaking(false);
  };

  const handleSpawnPoint = (spawnPoint: any) => {
    console.log("got spawn point: ", spawnPoint);
    useRoomStore.getState().setSpawnPoint(spawnPoint);
  };

  // Effect for socket events
  useEffect(() => {
    if (!socket) return;

    socket.on("roomSnapshot", handleRoomSnapshot);
    socket.on("searchingForMatch", confirmMatchmaking);
    socket.on("roomAssigned", handleRoomAssigned);
    socket.on("cancelledMatchmaking", handleCancelledMatchmaking);
    socket.on("spawnPoint", handleSpawnPoint);

    return () => {
      socket.off("roomSnapshot", handleRoomSnapshot);
      socket.off("roomAssigned", handleRoomAssigned);
      socket.off("cancelledMatchmaking", handleCancelledMatchmaking);
      socket.off("spawnPoint", handleSpawnPoint);
    };
  }, [socket]);
}
