export interface Position {
    x: number;
    y: number;
    z: number;
}

export interface Player {
    id: string;
    team: string;
    position: Position;
    velocity: Position;
    health: number;
}

export interface PlayerMap {
    [socketId: string]: {
        position: Position;
        velocity: Position;
        health?: number;
        team?: string;
    };
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
    user?: any;
}

