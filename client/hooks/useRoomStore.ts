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
    players: Player[];
    setPlayers: (list: Player[]) => void;
    addPlayers: (player: Player[]) => void;
    removePlayer: (id: string) => void;
}

export const useRoomStore = create<RoomStore>((set) => ({
    players: [],
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
    removePlayer: (id) => set((state) => ({ players: state.players.filter((p) => p.socketId !== id) })),
}));
