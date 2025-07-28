import { v4 as uuidv4 } from "uuid"
import type { AuthenticatedSocket, Position, Vegetation } from "./types";
import { Vector3 } from "three";
import { createNoise2D } from 'simplex-noise';
import { rooms, grid } from "./data";
import { Server } from "socket.io";

export function getCellKey(position: Position): string {
  const cellX = Math.floor(position.x / 100);
  const cellZ = Math.floor(position.z / 100);
  return `${cellX}_${cellZ}`;
}

export function getNearbyPlayers(socket: AuthenticatedSocket, centerKey: string): string[] {
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

export function getRandomPosition(min = -10, max = 10): Position {
  const rand = () => Math.random() * (max - min) + min;
  return { x: rand(), y: 0, z: rand() };
}

export function rayIntersectsSphere(
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

export function findOrCreateRoom(userId: string, socketId: string, socket: AuthenticatedSocket) {
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
      const densityFactor = 0.003;
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
    };
    rooms.push(room);
    console.log(`New room created: ${room.id}`);
    console.log("rooms reference in findOrCreateRoom", rooms);

  } else {
    if (userId) {
      console.log(`User ${userId} joined room: ${room.id}`);
    } else {
      console.log("User ID is required to join a room.");
    }

  }

  return room;
}


export function broadcastToNearbyPlayers(socket: AuthenticatedSocket, cellKey: string, data: {event: string, payload: any}, io: Server) {
  const nearbySocketIds = getNearbyPlayers(socket, cellKey);
  for (const id of nearbySocketIds) {
    io.to(id).emit(data.event, data.payload);
  }
}
