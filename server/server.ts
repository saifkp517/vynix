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


// //user match-making algorithm
// class MinHeap<T> {

//     private heap: T[] = [];
//     private compare: (a: T, b: T) => number;

//     constructor(compareFunction: (a: T, b: T) => number) {
//         this.compare = compareFunction;
//     }

//     private swap(i: number, j: number): void {
//         [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
//     }

//     insert(value: T) {
//         this.heap.push(value);
//         this.bubbleUp(this.heap.length - 1);
//     }

//     private bubbleUp(index: number): void {
//         while (index > 0) {
//             let parentIndex = Math.floor((index - 1) / 2);
//             if (this.compare(this.heap[index], this.heap[parentIndex]) >= 0) break;
//             this.swap(index, parentIndex);
//             index = parentIndex;
//         }
//     }

//     extractMin(): T | null {
//         if (this.heap.length === 0) return null;
//         if (this.heap.length === 1) return this.heap.pop() as T;

//         const min = this.heap[0];
//         this.heap[0] = this.heap.pop() as T;
//         this.bubbleDown(0);
//         return min;
//     }

//     bubbleDown(index: number): void {
//         let smallest = index;
//         let leftChild = 2 * index + 1;
//         let rightChild = 2 * index + 1;

//         if (leftChild < this.heap.length && this.compare(this.heap[leftChild], this.heap[smallest]) < 0) {
//             smallest = leftChild;
//         }

//         if (rightChild < this.heap.length && this.compare(this.heap[rightChild], this.heap[smallest]) < 0) {
//             smallest = rightChild;
//         }

//         if (smallest !== index) {
//             this.swap(index, smallest);
//             this.bubbleDown(smallest);
//         }
//     }

//     getSize(): number {
//         return this.heap.length;
//     }
// }

// class MatchMaking {
//     private eloHeaps: Map<number, MinHeap<Player>> = new Map();

//     constructor() { }

//     private getEloRange(elo: number): number {
//         return Math.floor(elo / 100) * 100;
//     }

//     addPlayer(player: Player) {
//         const range = this.getEloRange(player.eloRating);

//         if (!this.eloHeaps.has(range)) {
//             this.eloHeaps.set(range, new MinHeap<Player>((a, b) => a.eloRating - b.eloRating))
//         }

//         this.eloHeaps.get(range)!.insert(player);
//     }

//     findMatch(player: Player, eloRange = 50): Player | null {
//         const range = this.getEloRange(player.eloRating);

//         let bestMatch: Player | null = null;

//         const isValidMatch = (match: Player | null) => match && match.userId !== player.userId; // Ensure different users

//         // Check the player's range heap first
//         if (this.eloHeaps.has(range)) {
//             bestMatch = this.eloHeaps.get(range)!.extractMin();
//             if (!isValidMatch(bestMatch)) bestMatch = null;
//         }

//         // If no match, check adjacent ranges (lower & higher ELO brackets)
//         if (!bestMatch) {
//             if (this.eloHeaps.has(range - 100)) {
//                 bestMatch = this.eloHeaps.get(range - 100)!.extractMin();
//                 if (!isValidMatch(bestMatch)) bestMatch = null;
//             }
//             if (!bestMatch && this.eloHeaps.has(range + 100)) {
//                 bestMatch = this.eloHeaps.get(range + 100)!.extractMin();
//                 if (!isValidMatch(bestMatch)) bestMatch = null;
//             }
//         }

//         // As a last resort, look through all heaps for a valid match
//         if (!bestMatch) {
//             for (const heap of this.eloHeaps.values()) {
//                 while (heap.getSize() > 0) {
//                     bestMatch = heap.extractMin();
//                     if (isValidMatch(bestMatch)) break;
//                     bestMatch = null; // If invalid, keep searching
//                 }
//                 if (bestMatch) break;
//             }
//         }

//         return bestMatch;
//     }
// }


// const activeRooms: ActiveRooms = {};



// io.use(async (socket: AuthenticatedSocket, next) => {
//     const cookieString = socket.request.headers.cookie;;
//     if (!cookieString) {
//         console.log("Authentication Error")
//         return next(new Error("Authentication Error"));
//     }

//     try {

//         const match = cookieString.match(/session_id=([^;]+)/);
//         const session_id = match ? match[1] : null;

//         const user = await authorizeSession(session_id);
//         socket.user = user;
//         next();
//     } catch (err) {
//         console.log("invalid token")
//         next(new Error("Invalid token"));
//     }
// })

type Position = {
    x: number;
    y: number;
    z: number;
};

type PlayerMap = {
    [socketId: string]: Position;
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



function findOrCreateRoom(userId: string, socketId: string, socket: Socket) {
    let room = rooms.find(r => r.players.length < r.maxPlayers);
    if (!room) {

        const getGroundHeight = (x: number, z: number):number => {
            const primaryFrequency = 0.05;
            // Higher frequency = more hills, lower frequency = larger hills
            const secondaryFrequency = 0.2;
            const amplitude = 5; // increases height of hills
            const noiseAmplitude = 0.2; // increases noise variation
      
            const baseHeight = Math.sin(x * primaryFrequency) * Math.cos(z * primaryFrequency) * amplitude;
            const noise = Math.sin(x * secondaryFrequency * 3.7) * Math.cos(z * secondaryFrequency * 2.3) * noiseAmplitude;
      
            return baseHeight + noise;
        }

        const generateTreePositions = () => {

            const radius = 2000;
            const density = 0.01;
            const center = [0,0,0];

            const positions: TreePosition[] = [];
            const treeCount = Math.floor(radius * radius * density);

            // Seeded random number generator
            const seed = 12345; // Replace with a consistent seed value
            let random = (function (seed) {
                let value = seed;
                return () => {
                    value = (value * 9301 + 49297) % 233280;
                    return value / 233280;
                };
            })(seed);

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
            console.log(`User ${JSON.stringify(userId, null, 2)} is joining room: ${room.id}`);
            console.log(`User ${userId} joined room: ${room.id}`);
        } else {
            console.log("User ID is required to join a room.");
        }

    }

    return room;
}


io.on('connection', (socket: AuthenticatedSocket) => {

    const innerRadius = 50;


    console.log('User connected:', socket.id);

    socket.emit("currentPlayers", players);

    socket.on("joinRoom", (userId) => {

        console.log('user has joined room', userId)
        const room = findOrCreateRoom(userId, socket.id, socket);
        socket.join(room.id);

        //assign team to player
        const team = Math.random() < 0.5 ? "red" : "blue";

        const newPlayer: Player = {
            id: userId,
            playerCenter: {x: 0, y: 0, z: 0},
            team: team
        }
        room.players.push(newPlayer)
        socket.emit('roomAssigned', { room: room, team });

    })



    socket.broadcast.emit("newPlayer", { id: socket.id, position: players[socket.id] })

    let newCenter: Position = { x: 0, y: 0, z: 0 };

    socket.on('updatePosition', (position) => {

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


        players[socket.id] = position;

        socket.broadcast.emit('playerMoved', { id: socket.id, position });
        socket.broadcast.emit('playerMoved', { id: socket.id, position });
    });

    socket.on("disconnect", () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    })

    // socket.on("findMatch", (playerData) => {
    //     const { userId, eloRating } = playerData;

    //     const player: Player = { userId, eloRating, socket, socketId: socket.id }

    //     console.log(`Player ${userId} search for a match....`);

    //     const opponent = matchMakingSystem.findMatch(player);

    //     if (opponent) {
    //         console.log(`Match found: ${player.userId} vs ${opponent.userId}`);

    //         player.socket?.emit("matchFound", { opponentId: opponent.userId });
    //         opponent.socket?.emit("matchFound", { opponentId: player.userId });

    //     } else {
    //         matchMakingSystem.addPlayer(player);

    //         socket.emit("waiting", { message: "Waiting for an Opponenent" });
    //     }
    // });

    // socket.on('joinRoom', (userid) => {
    //     console.log('user has joined room')
    //     const roomId = findOrCreateRoom(userid, socket.id);
    //     socket.join(roomId);

    //     const players = activeRooms[roomId].players;
    //     console.log(players)
    //     socket.emit('roomAssigned', { roomId });

    //     io.to(roomId).emit('updatePlayers', players);

    //     if (players.length === 2) {
    //         io.to(roomId).emit('startBattle', { roomId, players })
    //     }
    // })

    // //sync code across both players
    // socket.on('codeUpdate', ({ roomId, code }) => {

    //     socket.to(roomId).emit('opponentCode', {
    //         code,
    //         from: socket.id,
    //     });
    // });

    // socket.on('disconnect', () => {
    //     console.log(`User ${socket.user} disconnected`);
    //     removePlayer(socket.id);
    // })
})




// function removePlayer(socketId: string) {
//     for (const roomId in activeRooms) {

//         activeRooms[roomId].players = activeRooms[roomId].players.filter(
//             (player) => player.socketId !== socketId
//         );

//         if (activeRooms[roomId].players.length == 1) {
//             const winner = activeRooms[roomId].players[0];
//             io.to(winner.socketId).emit("gameOver", {
//                 winner: winner.userId,
//                 message: "Your Opponent has been disconnected. You WIN!"
//             })

//             delete activeRooms[roomId];

//         } else if (activeRooms[roomId].players.length === 0) {
//             delete activeRooms[roomId]; // Cleanup empty rooms
//         }
//     }
// }

// const matchMakingSystem = new MatchMaking();





// function categorizeProblems(dir: string) {
//     const categories: Categories = {};

//     const folders = fs.readdirSync(dir, { withFileTypes: true });

//     folders.forEach((folder) => {
//         if (folder.isDirectory()) {
//             const folderPath = path.join(dir, folder.name);

//             const problems = fs.readdirSync(folderPath).filter(file => file.endsWith('.py'));

//             categories[folder.name] = problems;

//         }


//     })

//     return categories;
// }

const baseDir = '../../coding-problems'

// const categorizedData = categorizeProblems(baseDir);


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

