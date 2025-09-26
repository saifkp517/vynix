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

interface RoomStore {
    spawnPoint: Vector3;
    setSpawnPoint: (spawnPoint: Vector3) => void;
    players: Player[];
    getPlayer: (playerId: string) => Player | undefined;
    setPlayers: (list: Player[]) => void;
    addPlayers: (player: Player[]) => void;
    updatePlayer: (id: string, updatedData: Partial<Player>) => void;
    removePlayer: (id: string) => void;
}

export const useRoomStore = create<RoomStore>((set) => ({
    spawnPoint: new Vector3(0, 0, 0),
    setSpawnPoint: (spawnPoint) => set({ spawnPoint }),
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
