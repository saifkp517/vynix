import { Vector3 } from 'three';
import { Socket } from 'socket.io';

export interface Player {
    socketId: string;
    userId: string;
    room: string;
    username: string;
    position: Vector3;
    velocity: Vector3;
    health: number;
    isDead: boolean;
    kills: number;
    deaths: number;
    cameraDirection: Vector3;
    isBot?: boolean;
    // ms timestamp of the last time this player took damage — drives
    // CombatService's regen loop (heals once 60s have passed with no hit).
    lastHitAt: number;
    // ms timestamp (Date.now()-based) until which this player is immune to
    // damage — 0/past means not invincible. Set by CombatService.activateInvincibility.
    invincibleUntil: number;
    // ms timestamp until which the invincibility ability is on cooldown for
    // this player — enforced server-side so a client can't spam the trigger.
    abilityCooldownUntil: number;
}

export interface ShooterIdentity {
    id: string;
    username: string;
    // Bots fire with a same-tick ray already built from their current
    // position, so their shots skip CombatService's lag-compensation rewind.
    isBot?: boolean;
}

export interface PlayerMap {
    [socketId: string]: Player;
}

export interface ShootObject {
    // Camera-based aim ray — authoritative for hit detection. Never rendered.
    rayOrigin: { x: number; y: number; z: number };
    rayDirection: { x: number; y: number; z: number };
    // Barrel position — cosmetic only, broadcast to other clients so their
    // tracer/impact visuals originate from the gun instead of the camera.
    muzzleOrigin: { x: number; y: number; z: number };
}

export interface RayIntersectionResult {
    hit: boolean;
    distance: number;
}

export interface Room {
    id: string;
    players: Player[];
    vegetationPositions: any[];
    maxPlayers: number;
}

export interface Vegetation {
    type: string;
    position: [number, number, number];
    rotation: number;
    scale: number;
}

export interface AuthenticatedSocket extends Socket {
    userId: string;
    username: string;
}

// Physical radius: bot obstacle avoidance and spawn resolution use this to
// keep a body from ending up inside a trunk. Matches the rendered sphere.
export const PLAYER_RADIUS = 1;

// Radius of the *hittable* sphere in CombatService.handleShoot, deliberately
// 2x the physical/visual radius. Third-person aim in this game is hard enough
// that a hitbox matching the model exactly made shots feel like they never
// stuck; this trades realism for shots that register. Keep it separate from
// PLAYER_RADIUS — widening that one instead would also fatten bot obstacle
// avoidance and spawn placement, which has nothing to do with shooting.
export const PLAYER_HITBOX_RADIUS = PLAYER_RADIUS * 3;

// Must match `playerHeight` in client/components/game-components/player/TPP.tsx —
// real clients report position.y as groundHeight + playerHeight, not raw ground height.
export const PLAYER_HEIGHT = 3;

// player.position is eye-level (see PLAYER_HEIGHT); the hittable sphere used by
// CombatService.rayIntersectsSphere is centred this far below it, at torso height.
export const PLAYER_HITBOX_Y_OFFSET = 1.5;
