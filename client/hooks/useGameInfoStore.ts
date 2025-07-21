import { create } from 'zustand';

interface GameInfoStateType {
    roomId: string | null;
    userid: string | null;
    ammo: number;
    shootBullet: () => void;
    resetAmmo: (maxAmmo: number) => void;
    kills: number;
    setKills: (kills: number) => void;
}

export const useGameInfoStore = create<GameInfoStateType>((set) => ({
  roomId: null,
  userid: null,
  ammo: 0,
  shootBullet: () =>
  set((state) => ({
    ammo: state.ammo > 0 ? state.ammo - 1 : 0,
  })),
  resetAmmo: (maxAmmo: number) => set({ ammo: maxAmmo }),
  kills: 0,
  setKills: (kills) => set({ kills }),
}));
