import { create } from "zustand";
import type { Player } from "@/app/types/types";


interface RoomStore {
    players: Player[];
    setPlayers: (list: Player[]) => void;
    addPlayers: (player: Player[]) => void;
    removePlayer: (id: string) => void;
}

export const useRoomStore = create<RoomStore>((set) => ({
    players: [],
    setPlayers: (list) => set({ players: list }),
    addPlayers: (player) => set((state) => ({ players: [...state.players, ...player] })),
    removePlayer: (id) => set((state) => ({ players: state.players.filter((p) => p.id !== id) })),
}));
