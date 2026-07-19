import { Injectable } from '@nestjs/common';
import { Vector3 } from 'three';

import { RedisService } from '../redis/redis.service';
import { PlayersService } from '../players/players.service';
import { PhysicsService } from '../physics/physics.service';
import { Player } from '../players/players.types';

const WAITING_POOL_KEY = 'waitPool';

@Injectable()
export class MatchmakingService {
  constructor(
    private readonly redisService: RedisService,
    private readonly playersService: PlayersService,
    private readonly physicsService: PhysicsService,
  ) {}

  // ---- Wait pool management ----

  async addToWaitPool(socketId: string): Promise<number> {
    await this.redisService.sAdd(WAITING_POOL_KEY, socketId);
    return this.redisService.sCard(WAITING_POOL_KEY);
  }

  async removeFromWaitPool(socketId: string): Promise<void> {
    await this.redisService.sRem(WAITING_POOL_KEY, socketId);
  }

  async getPoolCount(): Promise<number> {
    return this.redisService.sCard(WAITING_POOL_KEY);
  }

  /**
   * Atomically removes all current pool members in one Redis SPOP call.
   * Reduces (but does not eliminate) the BUG-12 race window between sCard and pop.
   */
  async drainPool(): Promise<string[]> {
    const count = await this.redisService.sCard(WAITING_POOL_KEY);
    if (count === 0) return [];
    return this.redisService.sPopCount(WAITING_POOL_KEY, count);
  }

  // ---- Player enrollment ----

  /**
   * Computes a safe spawn position via PhysicsService and persists player state in Redis.
   * Does NOT join socket.io room or emit any events — the Gateway handles that.
   */
  async enrollPlayer(
    socketId: string,
    userId: string,
    username: string,
    roomId: string,
  ): Promise<{ player: Player; spawnPoint: Vector3 }> {
    const spawnPoint = await this.physicsService.getSpawnPosition(roomId);

    const player: Player = {
      socketId,
      userId,
      room: roomId,
      position: spawnPoint,
      velocity: new Vector3(0, 0, 0),
      cameraDirection: new Vector3(0, 0, 0),
      username,
      isDead: false,
      kills: 0,
      deaths: 0,
      health: 100,
    };

    await this.playersService.setPlayerInRoom(player);
    this.physicsService.updatePlayerCell(roomId, socketId, spawnPoint);

    return { player, spawnPoint };
  }
}
