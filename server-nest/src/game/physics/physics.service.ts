import { Injectable } from '@nestjs/common';
import { Vector3 } from 'three';

import { PlayersService } from '../players/players.service';

type Grid = Map<string, Set<string>>;

@Injectable()
export class PhysicsService {
  private readonly grid: Grid = new Map();

  constructor(private readonly playersService: PlayersService) {}

  // ── Grid ─────────────────────────────────────────────────────────────────────

  getCellKey(roomId: string, position: Vector3): string {
    const cellX = Math.floor(position.x / 100);
    const cellZ = Math.floor(position.z / 100);
    return `${roomId}:${cellX}_${cellZ}`;
  }

  getNearbySocketIds(roomId: string, socketId: string, cellKey: string): string[] {
    const parts = cellKey.split(':');
    const [xStr, zStr] = parts[parts.length - 1].split('_');
    const cx = parseInt(xStr);
    const cz = parseInt(zStr);

    const nearby = new Set<string>();

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cell = this.grid.get(`${roomId}:${cx + dx}_${cz + dz}`);
        if (cell) {
          for (const id of cell) nearby.add(id);
        }
      }
    }

    nearby.delete(socketId);
    return Array.from(nearby);
  }

  /**
   * Removes the socket from its current cell, inserts it at the new position,
   * and returns nearby socket IDs (excluding self) for broadcast. Cells are
   * namespaced by roomId so proximity never leaks across rooms.
   */
  updatePlayerCell(roomId: string, socketId: string, position: Vector3): string[] {
    for (const [key, set] of this.grid) {
      if (set.has(socketId)) {
        set.delete(socketId);
        if (set.size === 0) this.grid.delete(key);
        break;
      }
    }

    const cellKey = this.getCellKey(roomId, position);
    if (!this.grid.has(cellKey)) this.grid.set(cellKey, new Set());
    this.grid.get(cellKey)!.add(socketId);

    const nearby = this.getNearbySocketIds(roomId, socketId, cellKey);
    console.log(
      `[Physics] ${socketId} -> cell ${cellKey} (grid has ${this.grid.size} cells), nearby=[${nearby.join(', ')}]`,
    );

    return nearby;
  }

  removeFromGrid(socketId: string): void {
    for (const [key, set] of this.grid) {
      if (set.has(socketId)) {
        set.delete(socketId);
        if (set.size === 0) this.grid.delete(key);
        return;
      }
    }
  }

  // ── Spawn ─────────────────────────────────────────────────────────────────────

  private randomSpawnPoint(): Vector3 {
    return new Vector3(
      Math.random() * 200 - 100,
      0,
      Math.random() * 200 - 100,
    );
  }

  private distance3D(a: Vector3, b: Vector3): number {
    return Math.sqrt(
      (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2,
    );
  }

  async getSpawnPosition(roomId: string): Promise<Vector3> {
    const roomPlayers = await this.playersService.getAllPlayersFromRoom(roomId);
    const playerList = Object.values(roomPlayers);

    const MIN_DISTANCE = 50;
    const MAX_ATTEMPTS = 30;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const candidate = this.randomSpawnPoint();
      let safe = true;

      for (const player of playerList) {
        if (this.distance3D(candidate, player.position) < MIN_DISTANCE) {
          safe = false;
          break;
        }
      }

      if (safe) return candidate;
    }

    return this.randomSpawnPoint();
  }

  // ── Raycasting ────────────────────────────────────────────────────────────────

  rayIntersectsSphere(
    rayOrigin: Vector3,
    rayDirection: Vector3,
    sphereCenter: Vector3,
    sphereRadius: number,
  ): { hit: boolean; distance: number } {
    if (!rayOrigin || !rayDirection || !sphereCenter) {
      return { hit: false, distance: Infinity };
    }

    const toCenter = new Vector3().subVectors(sphereCenter, rayOrigin);
    const projectionLength = toCenter.dot(rayDirection);

    if (projectionLength < 0) return { hit: false, distance: Infinity };

    const closestPoint = rayOrigin
      .clone()
      .add(rayDirection.clone().multiplyScalar(projectionLength));

    const distanceToCenter = closestPoint.distanceTo(sphereCenter);

    return {
      hit: distanceToCenter <= sphereRadius,
      distance: distanceToCenter,
    };
  }
}