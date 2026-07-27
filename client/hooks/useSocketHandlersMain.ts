import { useEffect } from "react";
import { useRoomStore, Player } from "./useRoomStore";

// Hook expects the socket and the setter functions you already use
export function useSocketHandlers(
  socket: any,
  {
    setMatchmakingStatus,
    setIsMatchmaking,
    setRoomId,
    redirect,
  }: {
    setMatchmakingStatus: (status: string) => void;
    setIsMatchmaking: (val: boolean) => void;
    setRoomId?: (roomId: string) => void;
    redirect: (path: string) => void;
  }
) {
  // Handlers
  const handleRoomSnapshot = ({ roomPlayers }: { roomPlayers: Record<string, Player> }) => {
    const playersArray = Object.values(roomPlayers);
    useRoomStore.getState().setPlayers([...playersArray]);
  };

  const confirmMatchmaking = () => {
    setMatchmakingStatus("Matchmaking...");
    setIsMatchmaking(true);
  }

  // Room is assigned as soon as the player is placed — this does NOT mean
  // the match is full yet. Bots trickle in afterward; the page watches the
  // room's player count and redirects once it hits the match size.
  const handleRoomAssigned = ({ roomId }: { roomId: string }) => {
    setMatchmakingStatus("Room found — waiting for lobby to fill");
    setRoomId?.(roomId);
  };

  const handlePlayerJoined = (player: any) => {
    useRoomStore.getState().addPlayers([
      {
        socketId: player.id,
        userId: player.id,
        room: "",
        position: player.position,
        velocity: player.velocity,
        cameraDirection: player.cameraDirection,
        username: player.username,
        isDead: player.isDead ?? false,
        kills: player.kills ?? 0,
        deaths: player.deaths ?? 0,
        health: player.health ?? 100,
      },
    ]);
  };

  const handleCancelledMatchmaking = () => {
    setMatchmakingStatus("Find Match");
    setIsMatchmaking(false);
  };

  const handleSpawnPoint = (spawnPoint: any) => {
    useRoomStore.getState().setSpawnPoint(spawnPoint);
  };

  // Effect for socket events
  useEffect(() => {
    if (!socket) return;

    socket.on("roomSnapshot", handleRoomSnapshot);
    socket.on("searchingForMatch", confirmMatchmaking);
    socket.on("roomAssigned", handleRoomAssigned);
    socket.on("playerJoined", handlePlayerJoined);
    socket.on("cancelledMatchmaking", handleCancelledMatchmaking);
    socket.on("spawnPoint", handleSpawnPoint);

    return () => {
      socket.off("roomSnapshot", handleRoomSnapshot);
      socket.off("roomAssigned", handleRoomAssigned);
      socket.off("playerJoined", handlePlayerJoined);
      socket.off("cancelledMatchmaking", handleCancelledMatchmaking);
      socket.off("spawnPoint", handleSpawnPoint);
    };
  }, [socket]);
}
