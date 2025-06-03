import express from "express";
import { PrismaClient } from "@prisma/client";
import { Server, Socket } from "socket.io"
import { createServer } from "http"
import { Ray, Vector3 } from "three"
import { createNoise2D } from 'simplex-noise';
import { v4 as uuidv4 } from "uuid"
import fs from "fs";
import cookieParser from "cookie-parser";
import cors from "cors";
import { authorizeSession } from "./routes/authRoutes";
import path from "path";
import router from "./routes/authRoutes";

interface AuthenticatedSocket extends Socket {
    user?: any;
}

const prisma = new PrismaClient();

const app = express();
const httpServer = createServer(app)
const allowedOrigins = [
    "http://localhost:3000",
    "https://vynix-kohl.vercel.app",
    "https://upload-delivering-wildlife-cartridge.trycloudflare.com",
];


const io = new Server(httpServer, {
    cors: {
        origin: allowedOrigins,
        credentials: true
    }
});

app.use(cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));


app.use(express.json());
app.use(cookieParser());

//Routes
app.use("/auth", router);

type Vegetation = {
    type: string;
    position: [number, number, number];
    rotation: number;
    scale: number;
};

type Position = {
    x: number;
    y: number;
    z: number;
};

type PlayerMap = {
    [socketId: string]: {
        position: Position;
        velocity: Position;
        health: number;
        team?: string;
    };
};

let players: PlayerMap = {};

function getRandomPosition(min = -10, max = 10) {
    const rand = () => Math.random() * (max - min) + min;
    return { x: rand(), y: 0, z: rand() }; // y is usually 0 for ground level
}

type Player = {
    id: string;
    team: string;
    position?: Position;
}

type Room = {
    id: string;
    players: Player[];
    maxPlayers: number;
    vegetationPositions: Vegetation[]
    gameStarted: boolean;
}


const rooms: Room[] = [];

const CELL_SIZE = 100;
type Grid = Map<string, Set<string>>;
const grid: Grid = new Map();

function getCellKey(position: Position): string {
    const cellX = Math.floor(position.x / CELL_SIZE);
    const cellZ = Math.floor(position.z / CELL_SIZE);

    return `${cellX}_${cellZ}`;
}

function getNearbyPlayers(socket: Socket, centerKey: string): string[] {
    const [xStr, zStr] = centerKey.split("_");
    const x = parseInt(xStr);
    const z = parseInt(zStr);

    const nearby: Set<string> = new Set();

    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const key = `${x + dx}_${z + dz}`;
            const cell = grid.get(key);
            if (cell) {
                for (const id of cell) {
                    nearby.add(id);
                }
            }
        }
    }

    // Return as array without the current player
    nearby.delete(socket.id);
    return Array.from(nearby);
}

function findOrCreateRoom(userId: string, socketId: string, socket: Socket) {
    let room = rooms.find(r => r.players.length < r.maxPlayers);
    if (!room) {

        const SEED = 12345;

        const getGroundHeight = (x: number, z: number): number => {

            const noise2D = createNoise2D(() => SEED);
            const primaryFrequency = 0.005; // Controls the scale of hills
            const secondaryFrequency = 0.01; // Controls smaller variations
            const amplitude = 25; // Height of hills
            const noiseAmplitude = 3; // Height of smaller variations

            // Primary terrain height using Simplex noise
            const baseHeight = noise2D(x * primaryFrequency, z * primaryFrequency) * amplitude;

            // Secondary noise for additional variation
            const noise = noise2D(x * secondaryFrequency * 3.7, z * secondaryFrequency * 2.3) * noiseAmplitude;

            return baseHeight + noise;
        }

        // Mulberry32 seeded RNG
        function mulberry32(seed: number) {
            return function () {
                seed |= 0;
                seed = seed + 0x6D2B79F5 | 0;
                var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
                t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
                return ((t ^ t >>> 14) >>> 0) / 4294967296;
            };
        }


        const generateTreeAndStonePositions = () => {
            const radius = 1000;
            const densityFactor = 0.002;
            const center = [0, 0, 0];
            const treeCount = Math.floor(Math.PI * radius * radius * densityFactor);

            const seed = 12345;
            let random = mulberry32(seed);

            const vegetation: Vegetation[] = [];
            const stoneFrequency = 100; // One stone every 10 trees

            for (let i = 0; i < treeCount; i++) {
                const angle = random() * Math.PI * 2;
                const dist = Math.sqrt(random()) * radius;

                const x = center[0] + Math.cos(angle) * dist;
                const z = center[2] + Math.sin(angle) * dist;
                const y = getGroundHeight(x, z) + 1.5;

                vegetation.push({
                    type: 'tree',
                    position: [x, y, z],
                    rotation: random() * Math.PI * 2,
                    scale: 0.8 + random() * 0.4,
                });

                // Add a stone every `stoneFrequency` trees
                if (i % stoneFrequency === 0) {
                    const stoneOffset = 5 + random() * 10; // Slightly offset from the tree
                    const stoneAngle = random() * Math.PI * 2;

                    const stoneX = x + Math.cos(stoneAngle) * stoneOffset;
                    const stoneZ = z + Math.sin(stoneAngle) * stoneOffset;
                    const stoneY = getGroundHeight(stoneX, stoneZ) + 0.5;

                    vegetation.push({
                        type: 'grass',
                        position: [stoneX, stoneY, stoneZ],
                        rotation: random() * Math.PI * 2,
                        scale: 0.5 + random() * 0.3,
                    });
                }
            }

            return vegetation;
        };


        room = {
            id: uuidv4(),
            players: [],
            maxPlayers: 10,
            vegetationPositions: generateTreeAndStonePositions(),
            gameStarted: false
        };
        rooms.push(room);
        console.log(`New room created: ${room.id}`);

    } else {
        if (userId) {
            console.log(`User ${userId} joined room: ${room.id}`);
        } else {
            console.log("User ID is required to join a room.");
        }

    }

    return room;
}



io.on('connection', (socket: AuthenticatedSocket) => {

    // Delay wrapper function
    function withDelay(callback: (...args: any[]) => void, delay = 0) {
        return (...args: any[]) => {
            setTimeout(() => {
                callback(...args);
            }, delay);
        };
    }

    socket.on("ping-check", withDelay(async (clientTime) => {
        socket.emit("pong-check", clientTime);
    }));

    const innerRadius = 50;

    console.log('User connected:', socket.id);

    socket.emit("currentPlayers", players);

    socket.on("joinRoom", withDelay((userId) => {
        const room = findOrCreateRoom(userId, socket.id, socket);
        socket.join(room.id);

        //assign team to player
        const team = Math.random() < 0.5 ? "red" : "blue";

        const newPlayer: Player = {
            id: userId,
            team: team
        }
        room.players.push(newPlayer)
        socket.emit('roomAssigned', { room: room, team });
        console.log(rooms.map(r => ({ roomId: r.id, playerIds: r.players.map(p => p.id) })));
    }));

    socket.on("sendMessage", withDelay(({ roomId, userId, message }) => {
        console.log(`Message from ${userId} in room ${roomId}: ${message}`);
        io.to(roomId).emit("receiveMessage", { userId, message });
    }));

    socket.broadcast.emit("newPlayer", { id: socket.id, position: players[socket.id] });

    let newCenter: Position = { x: 0, y: 0, z: 0 };

    socket.on("requestForestUpdate", withDelay(() => {
        console.log("requested");
        socket.emit('updateForest', { id: socket.id, position: { x: 0, y: 0, z: 0 } });
    }));

    socket.on('updatePosition', withDelay((position, velocity) => {

        let distance = Math.sqrt(
            Math.pow(position.x - newCenter.x, 2) +
            Math.pow(position.y - newCenter.y, 2) +
            Math.pow(position.z - newCenter.z, 2)
        );
        if (distance > innerRadius) {
            console.log(position);
            console.log("Player is outside the inner radius, updating position...");
            socket.emit('updateForest', { id: socket.id, position: position });
            newCenter = position;
        }

        players[socket.id] = { position, velocity, health: 100 };

        const cellKey = getCellKey(position);

        //remove player from old cell
        for (const [key, set] of grid.entries()) {
            if (set.has(socket.id)) set.delete(socket.id);
        }

        //add player to new cell
        if (!grid.has(cellKey)) grid.set(cellKey, new Set());
        grid.get(cellKey)?.add(socket.id);

        //broadcast only to players within my grid
        const nearbySocketIds = getNearbyPlayers(socket, cellKey);
        for (const id of nearbySocketIds) {
            io.to(id).emit('playerMoved', { id: socket.id, position, velocity });
        }
    }));

    function rayIntersectsSphere(
        rayOrigin: Vector3,
        rayDirection: Vector3,
        sphereCenter: Vector3,
        sphereRadius: number
    ): { hit: boolean, distance: number } {

        if (!rayOrigin || !rayDirection || !sphereCenter) {
            console.error("Invalid argument passed to rayIntersectsSphere:", {
                rayOrigin,
                rayDirection,
                sphereCenter
            });
            return { hit: false, distance: Infinity };
        }

        const toCenter = new Vector3().subVectors(sphereCenter, rayOrigin);
        const projectionLength = toCenter.dot(rayDirection);

        // Sphere is behind the ray origin
        if (projectionLength < 0) return { hit: false, distance: Infinity };

        const closestPoint = rayOrigin.clone().add(rayDirection.clone().multiplyScalar(projectionLength));
        const distanceToCenter = closestPoint.distanceTo(sphereCenter);

        const hit = distanceToCenter <= sphereRadius;
        return { hit, distance: distanceToCenter };
    }


    socket.on("shoot", ({ userId, shootObject }) => {

        Object.entries(players).forEach(([playerId, player]) => {
            if (playerId == userId) return; // Skip the current player

            const rayOrigin = new Vector3(
                shootObject.rayOrigin.x,
                shootObject.rayOrigin.y,
                shootObject.rayOrigin.z
            );
            const rayDirection = new Vector3(
                shootObject.rayDirection.x,
                shootObject.rayDirection.y,
                shootObject.rayDirection.z
            ).normalize(); // Always normalize the direction vector


            const playerCenter = new Vector3(
                player.position.x,
                player.position.y,
                player.position.z
            );
            // Try values that are "near" the ray

            const { hit, distance } = rayIntersectsSphere(rayOrigin, rayDirection, playerCenter, 1.5);

            console.log(`[Check] playerId: ${playerId}, hit: ${hit}, distance: ${distance.toFixed(3)} units`);

            if (hit) {
                console.log(`--> User-id(${playerId}) is hit!`);
                // Handle hit logic here, e.g., reduce health, notify players, etc.
                const hitPlayer = players[playerId];
                if (hitPlayer) {
                    hitPlayer.health -= 10; // Reduce health by 10
                    if (hitPlayer.health <= 0) {
                        console.log(`Player ${playerId} is dead!`);
                        io.to(playerId).emit("youDied", { message: "You are dead!" });
                        // Handle player death logic here
                        io.to(userId).emit("playerDead", { userId, playerId }); // Notify others
                    }
                }

            } else {
                console.log(`--> User-id(${playerId}) missed by ${distance.toFixed(3)} units`);
            }
        })

    })

    socket.on("disconnect", withDelay(() => {
        console.log('User disconnected:', socket.id);

        // Remove player from players map
        delete players[socket.id];

        // Remove player from their room
        for (const room of rooms) {
            const playerIndex = room.players.findIndex(player => player.id === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                console.log(`Player ${socket.id} removed from room ${room.id}`);
                console.log(rooms.map(r => ({ roomId: r.id, playerIds: r.players.map(p => p.id) })));
                break;
            }
        }

        io.emit('playerDisconnected', socket.id);
    }));
});


//db setup
async function main() {
    // ... you will write your Prisma Client queries here
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })

httpServer.listen(4000, () => console.log("Websocket server running on port 4000"))

