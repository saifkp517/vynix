import type { Vector3 } from "three";


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
    cameraDirection: Vector3
}

export interface PlayerMap {
    [socketId: string]: Player;
}

export interface ShootObject {
    rayOrigin: { x: number; y: number; z: number };
    rayDirection: { x: number; y: number; z: number };
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


import { Socket } from "socket.io";
export interface AuthenticatedSocket extends Socket {
    userId: string;
    username: string;
}

export const PLAYER_RADIUS = 1;