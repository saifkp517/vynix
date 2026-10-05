import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import socket from "@/lib/socket";
import { useRoomStore, Player } from "./useRoomStore";

export const MATCH_SIZE = 5;

/**
 * Owns the entire lobby-side socket conversation (flow C0–C1):
 *  - opens the socket + emits `requestMatchmaking` / `cancelMatchmaking`
 *  - listens for every server reply and folds it into local state / useRoomStore
 *  - routes to /forest/[roomId] once the room fills
 *
 * page.tsx only consumes what this returns — it never touches `socket` or
 * `useRoomStore` directly.
 */
export function useMatchmaking() {
  const router = useRouter();
  const [status, setStatus] = useState("Find Match");
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const players = useRoomStore((s) => s.players);

  useEffect(() => {
    const handleRoomSnapshot = ({ roomPlayers }: { roomPlayers: Record<string, Player> }) => {
      useRoomStore.getState().setPlayers([...Object.values(roomPlayers)]);
    };

    const confirmMatchmaking = () => {
      setStatus("Matchmaking...");
      setIsMatchmaking(true);
    };

    // Room is assigned as soon as the player is placed — this does NOT mean the
    // match is full yet. Bots trickle in afterward; the redirect effect below
    // waits for the player count to hit MATCH_SIZE.
    const handleRoomAssigned = ({ roomId }: { roomId: string }) => {
      setStatus("Room found — waiting for lobby to fill");
      setRoomId(roomId);
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
      setStatus("Find Match");
      setIsMatchmaking(false);
    };

    const handleSpawnPoint = (spawnPoint: any) => {
      useRoomStore.getState().setSpawnPoint(spawnPoint);
    };

    const handleGameStarted = ({ startTime, duration }: { startTime: number; duration: number }) => {
      useRoomStore.getState().setMatchTiming({ startTime, duration });
    };

    socket.on("roomSnapshot", handleRoomSnapshot);
    socket.on("searchingForMatch", confirmMatchmaking);
    socket.on("roomAssigned", handleRoomAssigned);
    socket.on("playerJoined", handlePlayerJoined);
    socket.on("cancelledMatchmaking", handleCancelledMatchmaking);
    socket.on("spawnPoint", handleSpawnPoint);
    socket.on("gameStarted", handleGameStarted);

    return () => {
      socket.off("roomSnapshot", handleRoomSnapshot);
      socket.off("searchingForMatch", confirmMatchmaking);
      socket.off("roomAssigned", handleRoomAssigned);
      socket.off("playerJoined", handlePlayerJoined);
      socket.off("cancelledMatchmaking", handleCancelledMatchmaking);
      socket.off("spawnPoint", handleSpawnPoint);
      socket.off("gameStarted", handleGameStarted);
    };
  }, []);

  // Once the room fills to match size, hold briefly on "Match starting" then
  // hand off to the room route (roomAssigned already fired earlier).
  useEffect(() => {
    if (!isMatchmaking || !roomId) return;
    if (players.length < MATCH_SIZE) return;

    setStatus("Match starting...");
    const timeout = setTimeout(() => {
      router.push(`/forest/${roomId}`);
    }, 900);

    return () => clearTimeout(timeout);
  }, [isMatchmaking, roomId, players.length, router]);

  const findMatch = useCallback((username: string) => {
    if (!socket.connected) socket.connect();
    useRoomStore.getState().setPlayers([]);
    setRoomId(null);
    socket.emit("requestMatchmaking", username);
    setIsMatchmaking(true);
    setStatus("Searching...");
    setTimeout(() => setStatus("Finding opponents..."), 1500);
  }, []);

  const cancelMatch = useCallback(() => {
    socket.emit("cancelMatchmaking");
    setIsMatchmaking(false);
    setStatus("Find Match");
    setRoomId(null);
    useRoomStore.getState().setPlayers([]);
  }, []);

  return { status, isMatchmaking, roomId, players, findMatch, cancelMatch };
}
