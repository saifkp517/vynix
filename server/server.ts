import express from "express";
import { PrismaClient } from "@prisma/client";
import { Server, Socket } from "socket.io"
import { createServer } from "http"
import axios from "axios";
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
    "https://vynix-git-main-my-team-e0738a04.vercel.app",
    "https://vynix-git-lod-my-team-e0738a04.vercel.app"
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

type ActiveRooms = {
    [key: string]: Room
};

interface Categories {
    [folderName: string]: string[];
}

type Position = {
    x: number;
    y: number;
    z: number;
};

type PlayerMap = {
    [socketId: string]: {
        position: Position;
        velocity: Position;
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
    playerCenter: Position;
}

type Room = {
    id: string;
    players: Player[];
    maxPlayers: number;
    treePositions: TreePosition[]
    gameStarted: boolean;
}

interface TreePosition {
    position: [number, number, number];
    rotation: number;
    scale: number;
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

        const getGroundHeight = (x: number, z: number): number => {
            const primaryFrequency = 0.05;
            // Higher frequency = more hills, lower frequency = larger hills
            const secondaryFrequency = 0.2;
            const amplitude = 5; // increases height of hills
            const noiseAmplitude = 0.2; // increases noise variation

            const baseHeight = Math.sin(x * primaryFrequency) * Math.cos(z * primaryFrequency) * amplitude;
            const noise = Math.sin(x * secondaryFrequency * 3.7) * Math.cos(z * secondaryFrequency * 2.3) * noiseAmplitude;

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
        const generateTreePositions = () => {

            const radius = 1000;
            const densityFactor = 0.005; // Adjust this value to control tree density (higher = more trees)
            const center = [0, 0, 0];

            const positions: TreePosition[] = [];
            const treeCount = Math.floor(Math.PI * radius * radius * densityFactor);

            // Seeded random number generator
            const seed = 12345; // Replace with a consistent seed value
            let random = mulberry32(seed);

            // Calculate unique positions for trees
            for (let i = 0; i < treeCount; i++) {
                const angle = random() * Math.PI * 2;
                const dist = Math.sqrt(random()) * radius;

                const x = center[0] + Math.cos(angle) * dist;
                const z = center[2] + Math.sin(angle) * dist;
                const y = getGroundHeight(x, z) + 1.5;

                positions.push({
                    position: [x, y, z] as [number, number, number],
                    rotation: random() * Math.PI * 2,
                    scale: 0.8 + random() * 0.4
                });
            }

            return positions;
        }

        room = {
            id: uuidv4(),
            players: [],
            maxPlayers: 10,
            treePositions: generateTreePositions(),
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

    const innerRadius = 100;

    console.log('User connected:', socket.id);

    socket.emit("currentPlayers", players);

    socket.on("joinRoom", (userId) => {

        const room = findOrCreateRoom(userId, socket.id, socket);
        socket.join(room.id);

        //assign team to player
        const team = Math.random() < 0.5 ? "red" : "blue";

        const newPlayer: Player = {
            id: userId,
            playerCenter: { x: 0, y: 0, z: 0 },
            team: team
        }
        room.players.push(newPlayer)
        socket.emit('roomAssigned', { room: room, team });
        console.log(rooms.map(r => ({ roomId: r.id, playerIds: r.players.map(p => p.id) })));
    })

    socket.broadcast.emit("newPlayer", { id: socket.id, position: players[socket.id] })

    let newCenter: Position = { x: 0, y: 0, z: 0 };

    socket.on("requestForestUpdate", () => {
        console.log("requested")
        socket.emit('updateForest', { id: socket.id, position: { x: 0, y: 0, z: 0 } });
    })

    socket.on('updatePosition', (position, velocity) => {

        let distance = Math.sqrt(
            Math.pow(position.x - newCenter.x, 2) +
            Math.pow(position.y - 0, 2) +
            Math.pow(position.z - newCenter.z, 2)
        );
        if (distance > innerRadius) {
            console.log(position)
            console.log("Player is outside the inner radius, updating position...");
            socket.emit('updateForest', { id: socket.id, position: position });
            newCenter = position;
        }

        players[socket.id] = {position, velocity};

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

    });

    socket.on("disconnect", () => {
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
    });
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

