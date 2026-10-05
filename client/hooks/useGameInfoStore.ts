// Local player's HUD/combat state (ammo, scope, health, ability, chat,
// hit-flash trigger). Written by useArenaSocket and Gun.tsx; read by GameInfo.
import { create } from 'zustand';

export interface ChatMessage {
    id: string;
    playerName: string;
    message: string;
    timestamp: Date;
}

export interface AbilityState {
    invincibleUntil: number;
    cooldownUntil: number;
}

interface GameInfoStateType {
    roomId: string | null;
    userid: string | null;
    ammo: number;
    shootBullet: () => void;
    resetAmmo: (maxAmmo: number) => void;
    kills: number;
    setKills: (kills: number) => void;
    isScoped: boolean;
    scopeLevel: number;
    // Percentage of the scope's zoom range, for display. The raw magnification
    // (scopeLevel) is engine-facing only and never surfaced to the player.
    scopePercent: number;
    setScope: (isScoped: boolean, scopeLevel: number, scopePercent: number) => void;

    // Local player's HUD state, pushed here by useArenaSocket ('hit',
    // 'healthRegen', 'playerRespawned', 'abilityActivated', 'playerDead').
    // GameInfo reads these instead of listening to the socket directly.
    health: number;
    setHealth: (health: number) => void;
    killerName: string | null;
    setKillerName: (killerName: string | null) => void;
    abilityState: AbilityState;
    setAbilityState: (abilityState: AbilityState) => void;

    // Bumped on every 'hit' the local player takes, alongside health. GameInfo
    // watches this to spawn its screen-flash effect — a plain trigger ref
    // wouldn't cause it to re-render, and unlike HitImpact, GameInfo has no
    // per-frame loop to poll one.
    hitSeq: number;
    lastHitRayOrigin: { x: number; y: number; z: number } | null;
    triggerHit: (rayOrigin: { x: number; y: number; z: number }) => void;

    chatMessages: ChatMessage[];
    addChatMessage: (message: ChatMessage) => void;
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
  isScoped: false,
  scopeLevel: 1,
  scopePercent: 0,
  setScope: (isScoped, scopeLevel, scopePercent) =>
    set({ isScoped, scopeLevel, scopePercent }),

  health: 100,
  setHealth: (health) => set({ health }),
  killerName: null,
  setKillerName: (killerName) => set({ killerName }),
  abilityState: { invincibleUntil: 0, cooldownUntil: 0 },
  setAbilityState: (abilityState) => set({ abilityState }),

  hitSeq: 0,
  lastHitRayOrigin: null,
  triggerHit: (rayOrigin) =>
    set((state) => ({ hitSeq: state.hitSeq + 1, lastHitRayOrigin: rayOrigin })),

  chatMessages: [],
  addChatMessage: (message) =>
    set((state) => ({ chatMessages: [...state.chatMessages, message] })),
}));
