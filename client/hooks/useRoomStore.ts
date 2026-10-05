// Room-wide coarse state (player roster, kill feed, spawn/match timing,
// forest drift target). Written by useArenaSocket; read by Scoreboard,
// Ground, TPP. Never per-frame-hot data — see landmine 2 in TODO-inbound.md.
import { create } from "zustand";
import { Vector3 } from "three";

export interface Player {
    socketId: string;
    userId: string;
    room: string;
    position: Vector3;
    velocity: Vector3;
    cameraDirection: Vector3;
    username: string;
    isDead: boolean;
    kills: number;
    deaths: number;
    health: number;
}

export interface MatchTiming {
    startTime: number;
    duration: number;
}

export interface KillFeedItem {
    id: string;
    killerId: string;
    victimId: string;
    killerName: string;
    victimName: string;
    timestamp: number;
}

const MAX_KILL_FEED_ITEMS = 8;

interface RoomStore {
    roomId: string;
    setRoomId: (roomId: string) => void;
    spawnPoint: Vector3;
    setSpawnPoint: (spawnPoint: Vector3) => void;
    players: Player[];
    getPlayer: (playerId: string) => Player | undefined;
    setPlayers: (list: Player[]) => void;
    addPlayers: (player: Player[]) => void;
    updatePlayer: (id: string, updatedData: Partial<Player>) => void;
    removePlayer: (id: string) => void;
    // 'gameStarted' fires on the lobby page, before GameInfo mounts in
    // /forest/[id] — stash it here so it survives the route change.
    matchTiming: MatchTiming | null;
    setMatchTiming: (matchTiming: MatchTiming) => void;
    // Server-pushed target for the drifting forest mesh ('updateForest').
    // Low-frequency; Ground lerps toward it.
    forestTarget: [number, number, number];
    setForestTarget: (pos: [number, number, number]) => void;
    // Recent kills for Scoreboard's kill-feed panel ('playerDead'). Capped at
    // MAX_KILL_FEED_ITEMS; stale entries are dropped by pruneKillFeed.
    killFeed: KillFeedItem[];
    addKillFeedItem: (item: KillFeedItem) => void;
    pruneKillFeed: (maxAgeMs: number) => void;
}

export const useRoomStore = create<RoomStore>((set) => ({
    roomId: "",
    setRoomId: (roomId) => set({ roomId }),
    spawnPoint: new Vector3(0, 0, 0),
    setSpawnPoint: (spawnPoint) => set({ spawnPoint }),
    matchTiming: null,
    setMatchTiming: (matchTiming) => set({ matchTiming }),
    forestTarget: [0, 0, 0],
    setForestTarget: (pos) => set({ forestTarget: pos }),
    killFeed: [] as KillFeedItem[],
    addKillFeedItem: (item) =>
        set((state) => ({ killFeed: [item, ...state.killFeed].slice(0, MAX_KILL_FEED_ITEMS) })),
    pruneKillFeed: (maxAgeMs) =>
        set((state) => ({
            killFeed: state.killFeed.filter((item) => Date.now() - item.timestamp < maxAgeMs),
        })),
    players: [] as Player[],
    getPlayer: (id: string): Player | undefined => {
        return useRoomStore.getState().players.find((p: Player) => p.socketId === id);
    },
    setPlayers: (list) => set({ players: list }),
    addPlayers: (newPlayers) =>
        set((state) => {
            const combined = [...state.players, ...newPlayers];
            const unique = combined.filter(
                (player, index, self) =>
                    index === self.findIndex((p) => p.socketId === player.socketId)
            );
            return { players: unique };
        }),
    updatePlayer: (id: string, updatedData: Partial<Player>) => {
        set((state) => {
            const players = state.players.map((player) =>
                player.socketId === id ? { ...player, ...updatedData } : player
            );
            return { players };
        });
    },
    removePlayer: (id) => set((state) => ({ players: state.players.filter((p) => p.socketId !== id) })),
}));
