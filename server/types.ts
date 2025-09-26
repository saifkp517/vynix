export type Vegetation = {
    type: string;
    position: [number, number, number];
    rotation: number;
    scale: number;
};

export type Position = {
    x: number;
    y: number;
    z: number;
};

export type PlayerMap = {
    [socketId: string]: {
        position: Position;
        velocity: Position;
        health?: number;
        team?: string;
    };
};

export type Player = {
    id: string;
    team: string;
    position?: Position;
}

export type Room = {
    id: string;
    players: Player[];
    maxPlayers: number;
    vegetationPositions: Vegetation[]
    groundHeight: (x: number, z: number) => number;
}
