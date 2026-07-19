import { Injectable } from '@nestjs/common';
import { Vector3 } from 'three';
import { Server } from 'socket.io';

import { RedisService } from '../redis/redis.service';
import { PlayersService } from '../players/players.service';
import { PhysicsService } from '../physics/physics.service';
import { type AuthenticatedSocket, type ShootObject, PLAYER_RADIUS } from '../players/players.types';

const DAMAGE_PER_HIT = 10;
const RESPAWN_DELAY_MS = 5000;

@Injectable()
export class CombatService {
  constructor(
    private readonly redisService: RedisService,
    private readonly playersService: PlayersService,
    private readonly physicsService: PhysicsService,
  ) {}

  private playerKey(roomId: string, socketId: string) {
    return `player:${roomId}:${socketId}`;
  }

  async handleShoot(
    shooterSocket: AuthenticatedSocket,
    roomId: string,
    shootObject: ShootObject,
    server: Server,
  ): Promise<void> {
    const rayOrigin = new Vector3(
      shootObject.rayOrigin.x,
      shootObject.rayOrigin.y,
      shootObject.rayOrigin.z,
    );
    const rayDirection = new Vector3(
      shootObject.rayDirection.x,
      shootObject.rayDirection.y,
      shootObject.rayDirection.z,
    ).normalize();

    // BUG-04 fix: broadcast playerShot once before the per-player loop
    const cellKey = this.physicsService.getCellKey(roomId, rayOrigin);
    const nearbyIds = this.physicsService.getNearbySocketIds(
      roomId,
      shooterSocket.id,
      cellKey,
    );
    for (const id of nearbyIds) {
      server.to(id).emit('playerShot', {
        id: shooterSocket.id,
        rayOrigin,
        rayDirection,
      });
    }

    const players = await this.playersService.getAllPlayersFromRoom(roomId);

    for (const [playerId, player] of Object.entries(players)) {
      // BUG-05 fix: compare socketId to socketId, not socketId to userId
      if (playerId === shooterSocket.id) continue;

      const playerCenter = new Vector3(
        player.position.x,
        player.position.y - 1.5, // hitbox centre offset
        player.position.z,
      );

      const { hit, distance } = this.physicsService.rayIntersectsSphere(
        rayOrigin,
        rayDirection,
        playerCenter,
        PLAYER_RADIUS,
      );

      console.log(
        `[Combat] ${playerId} — hit: ${hit}, dist: ${distance.toFixed(3)}`,
      );

      if (!hit) continue;

      server.to(playerId).emit('hit', { rayOrigin });

      const key = this.playerKey(roomId, playerId);
      const newHealth = await this.redisService.hIncrBy(key, 'health', -DAMAGE_PER_HIT);

      if (newHealth > 0) continue;

      // Health reached zero — attempt to claim the kill atomically
      await this.tryKill({
        key,
        roomId,
        playerId,
        player,
        shooterSocket,
        server,
      });
    }
  }

  private async tryKill({
    key,
    roomId,
    playerId,
    player,
    shooterSocket,
    server,
  }: {
    key: string;
    roomId: string;
    playerId: string;
    player: { username: string };
    shooterSocket: AuthenticatedSocket;
    server: Server;
  }): Promise<void> {
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await this.redisService.watch(key);

      const isDeadStr = await this.redisService.hGet(key, 'isDead');

      if (isDeadStr === 'true') {
        await this.redisService.unwatch();
        return; // another concurrent shot already claimed the kill
      }

      // Mark dead and increment shooter's kill + victim's death in one transaction
      const multi = this.redisService.multi();
      multi.hset(key, 'isDead', 'true');
      multi.hincrby(
        this.playerKey(roomId, shooterSocket.id),
        'kills',
        1,
      );
      multi.hincrby(key, 'deaths', 1);

      const result = await multi.exec();

      if (result === null) {
        // WATCH was triggered — another write won the race; retry
        continue;
      }

      // This caller won — remove victim from grid and emit death events
      this.physicsService.removeFromGrid(playerId);

      server.to(playerId).emit('youDied', { message: 'You are dead!' });
      server.to(roomId).emit('playerDead', {
        killerSocketId: shooterSocket.id,
        victimSocketId: playerId,
        killerName: shooterSocket.username,
        victimName: player.username,
      });

      this.scheduleRespawn(key, roomId, playerId, server);
      return;
    }
  }

  private scheduleRespawn(
    key: string,
    roomId: string,
    playerId: string,
    server: Server,
  ): void {
    setTimeout(async () => {
      try {
        // Guard: skip if the player already reconnected or game ended
        const currentIsDead = await this.redisService.hGet(key, 'isDead');
        if (currentIsDead !== 'true') return;

        const newPos = await this.physicsService.getSpawnPosition(roomId);

        await this.redisService.hSet(key, {
          isDead: 'false',
          health: String(100),
          position: JSON.stringify(newPos),
        });

        server.to(playerId).emit('spawnPoint', newPos);
        server.to(roomId).emit('playerRespawned', {
          id: playerId,
          position: newPos,
        });
      } catch (err) {
        console.error(`[Combat] Respawn failed for ${playerId}:`, err);
      }
    }, RESPAWN_DELAY_MS);
  }
}
