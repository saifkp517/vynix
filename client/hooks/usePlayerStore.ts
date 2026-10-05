import { create } from "zustand";

interface PlayerStore {
  /**
   * The local player's chosen callsign for this session's matches — the value
   * sent in `requestMatchmaking`. Defaults are derived from the Supabase
   * identity in page.tsx (guest id / profile name / email); `edited` latches
   * once the player types their own so the derivation stops overwriting it.
   */
  username: string;
  edited: boolean;
  /** Set the derived default — no-ops once the player has edited it. */
  setDerivedUsername: (username: string) => void;
  /** Set an explicit player-typed value and latch `edited`. */
  setUsername: (username: string) => void;

  /**
   * The socket connection id — the local player's identity inside a match
   * (which remote-player record is "me"). Reassigned on every (re)connect,
   * kept current by a single effect in the arena page. Empty when the socket
   * is not connected.
   */
  socketId: string;
  setSocketId: (socketId: string) => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  username: "",
  edited: false,
  setDerivedUsername: (username) => set((s) => (s.edited ? s : { username })),
  setUsername: (username) => set({ username, edited: true }),

  socketId: "",
  setSocketId: (socketId) => set({ socketId }),
}));
