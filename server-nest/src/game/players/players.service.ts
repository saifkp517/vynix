//src/game/players/players.service.ts

import { Injectable } from '@nestjs/common';
import { Vector3 } from 'three';

import { RedisService } from '../redis/redis.service';
import { Player } from './players.types';

/**
 * This service converts player types to redis strings
 * serialize converts to redis
 * deserialize converts from string in redis to object
 */

@Injectable()
export class PlayersService {
  constructor(
    private readonly redisService: RedisService,
  ) { }

  private serializePlayer(
    player: Partial<Player>,
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(player)) {
      if (value === undefined) {
        continue;
      }

      if (
        key === 'position' ||
        key === 'velocity' ||
        key === 'cameraDirection'
      ) {
        result[key] = JSON.stringify(value);
      } else if (typeof value === 'boolean') {
        result[key] = value ? 'true' : 'false';
      } else {
        result[key] = String(value);
      }
    }

    return result;
  }

  private deserializePlayer(
    data: Record<string, string>,
  ): Player {
    const position = JSON.parse(data.position);
    const velocity = JSON.parse(data.velocity);
    const cameraDirection = JSON.parse(
      data.cameraDirection,
    );

    return {
      socketId: data.socketId,
      userId: data.userId,
      room: data.room,

      position: new Vector3(
        position.x,
        position.y,
        position.z,
      ),

      velocity: new Vector3(
        velocity.x,
        velocity.y,
        velocity.z,
      ),

      cameraDirection: new Vector3(
        cameraDirection.x,
        cameraDirection.y,
        cameraDirection.z,
      ),

      username: data.username,

      isDead: data.isDead === 'true',

      kills: Number(data.kills),
      deaths: Number(data.deaths),
      health: Number(data.health),
    };
  }

  private getPlayerKey(
    roomId: string,
    socketId: string,
  ) {
    return `player:${roomId}:${socketId}`;
  }

  private getRoomPlayersKey(roomId: string) {
    return `roomPlayers:${roomId}`;
  }

  async setPlayerInRoom(player: Player) {
    const roomKey = this.getRoomPlayersKey(
      player.room,
    );

    const playerKey = this.getPlayerKey(
      player.room,
      player.socketId,
    );

    await this.redisService.sAdd(
      roomKey,
      player.socketId,
    );

    await this.redisService.hSet(
      playerKey,
      this.serializePlayer(player),
    );
  }

  async getPlayerFromRoom(
    roomId: string,
    socketId: string,
  ): Promise<Player | null> {
    const key = this.getPlayerKey(
      roomId,
      socketId,
    );

    const data =
      await this.redisService.hGetAll(key);

    if (!Object.keys(data).length) {
      return null;
    }

    return this.deserializePlayer(data);
  }

  async updatePlayerInRoom(
    roomId: string,
    socketId: string,
    updates: Partial<Player>,
  ) {
    const key = this.getPlayerKey(
      roomId,
      socketId,
    );

    await this.redisService.hSet(
      key,
      this.serializePlayer(updates),
    );
  }

  async deletePlayer(
    roomId: string,
    socketId: string,
  ): Promise<void> {
    await this.redisService.sRem(
      this.getRoomPlayersKey(roomId),
      socketId,
    );
    await this.redisService.del(
      this.getPlayerKey(roomId, socketId),
    );
  }

  async getAllPlayersFromRoom(
    roomId: string,
  ): Promise<Record<string, Player>> {
    const roomKey =
      this.getRoomPlayersKey(roomId);

    const socketIds =
      await this.redisService.sMembers(roomKey);

    const pipeline =
      this.redisService.pipeline();

    for (const socketId of socketIds) {
      pipeline.hgetall(
        this.getPlayerKey(roomId, socketId),
      );
    }

    const results = await pipeline.exec();

    const players: Record<string, Player> = {};

    results?.forEach((result, index) => {
      const [, data] = result;

      if (
        data &&
        typeof data === 'object' &&
        Object.keys(data).length
      ) {
        const player =
          this.deserializePlayer(
            data as Record<string, string>,
          );

        players[socketIds[index]] = player;
      }
    });

    return players;
  }
}