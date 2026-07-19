import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Vector3 } from 'three';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

import { PlayersService } from '../players/players.service';
import { MovementService } from '../movement/movement.service';
import { PhysicsService } from '../physics/physics.service';
import { CombatService } from '../combat/combat.service';
import { type Player } from '../players/players.types';
import {
  BOT_ID_PREFIX,
  BOT_TICK_MS,
  BOT_MOVE_SPEED,
  BOT_ENGAGEMENT_RADIUS,
  BOT_CLUSTER_CELL_SIZE,
} from './bots.constants';

/**
 * Bots are ordinary Player records (isBot: true, no socket) that a per-room
 * interval drives through the same MovementService/CombatService paths a
 * real client uses, so they're bound by identical physics and combat rules.
 * They never hold a socket, so state broadcasts only ever reach real clients
 * near them — bandwidth still scales with real player count, not bot count.
 */
@Injectable()
export class BotsService implements OnModuleDestroy {
  private readonly roomIntervals = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly playersService: PlayersService,
    private readonly movementService: MovementService,
    private readonly physicsService: PhysicsService,
    private readonly combatService: CombatService,
  ) {}

  async fillRoom(roomId: string, targetCount: number, server: Server): Promise<void> {
    const players = await this.playersService.getAllPlayersFromRoom(roomId);
    const botsNeeded = targetCount - Object.keys(players).length;

    for (let i = 0; i < botsNeeded; i++) {
      await this.spawnBot(roomId, server);
    }

    if (botsNeeded > 0) this.startTicking(roomId, server);
  }

  stopRoom(roomId: string): void {
    const interval = this.roomIntervals.get(roomId);
    if (interval) {
      clearInterval(interval);
      this.roomIntervals.delete(roomId);
    }
  }

  private async spawnBot(roomId: string, server: Server): Promise<void> {
    const botId = `${BOT_ID_PREFIX}${uuidv4()}`;
    const spawnPoint = await this.physicsService.getSpawnPosition(roomId);

    const bot: Player = {
      socketId: botId,
      userId: botId,
      room: roomId,
      username: `Bot_${botId.slice(BOT_ID_PREFIX.length, BOT_ID_PREFIX.length + 6)}`,
      position: spawnPoint,
      velocity: new Vector3(0, 0, 0),
      health: 100,
      isDead: false,
      kills: 0,
      deaths: 0,
      cameraDirection: new Vector3(0, 0, -1),
      isBot: true,
    };

    await this.playersService.setPlayerInRoom(bot);
    this.physicsService.updatePlayerCell(roomId, botId, spawnPoint);

    server.to(roomId).emit('playerJoined', {
      id: botId,
      username: bot.username,
      position: spawnPoint,
      velocity: bot.velocity,
      health: bot.health,
      kills: 0,
      deaths: 0,
      isDead: false,
    });
  }

  private startTicking(roomId: string, server: Server): void {
    if (this.roomIntervals.has(roomId)) return;

    const interval = setInterval(() => {
      void this.tickRoom(roomId, server);
    }, BOT_TICK_MS);

    this.roomIntervals.set(roomId, interval);
  }

  private async tickRoom(roomId: string, server: Server): Promise<void> {
    const players = await this.playersService.getAllPlayersFromRoom(roomId);
    const entities = Object.entries(players);

    if (entities.length === 0) {
      this.stopRoom(roomId);
      return;
    }

    const bots = entities.filter(([, p]) => p.isBot && !p.isDead);
    if (bots.length === 0) return;

    // Cluster and engagement targets are treated identically for players and
    // bots per-tick, so bots can end up chasing or shooting other bots.
    const cluster = this.computeClusterCentroid(entities.map(([, p]) => p));

    for (const [botId, bot] of bots) {
      await this.tickBot(roomId, botId, bot, entities, cluster, server);
    }
  }

  private computeClusterCentroid(entities: Player[]): Vector3 {
    const buckets = new Map<string, Vector3[]>();

    for (const entity of entities) {
      const key = `${Math.floor(entity.position.x / BOT_CLUSTER_CELL_SIZE)}_${Math.floor(entity.position.z / BOT_CLUSTER_CELL_SIZE)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(entity.position);
    }

    let densest = entities.map((entity) => entity.position);
    for (const positions of buckets.values()) {
      if (positions.length > densest.length) densest = positions;
    }

    const sum = densest.reduce((acc, position) => acc.add(position.clone()), new Vector3());
    return sum.divideScalar(densest.length);
  }

  private async tickBot(
    roomId: string,
    botId: string,
    bot: Player,
    entities: [string, Player][],
    cluster: Vector3,
    server: Server,
  ): Promise<void> {
    let nearestTarget: { id: string; player: Player; distance: number } | null = null;

    for (const [id, entity] of entities) {
      if (id === botId || entity.isDead) continue;

      const distance = bot.position.distanceTo(entity.position);
      if (distance <= BOT_ENGAGEMENT_RADIUS && (!nearestTarget || distance < nearestTarget.distance)) {
        nearestTarget = { id, player: entity, distance };
      }
    }

    const toCluster = cluster.clone().sub(bot.position);
    let newPosition = bot.position.clone();
    let velocity = new Vector3(0, 0, 0);

    if (toCluster.length() > 1) {
      const direction = toCluster.normalize();
      velocity = direction.multiplyScalar(BOT_MOVE_SPEED);
      newPosition = bot.position.clone().add(velocity);
    }

    const cameraDirection = nearestTarget
      ? nearestTarget.player.position.clone().sub(newPosition).normalize()
      : bot.cameraDirection;

    const { nearbySocketIds } = await this.movementService.process(
      botId,
      roomId,
      newPosition,
      velocity,
      cameraDirection,
    );

    for (const id of nearbySocketIds) {
      server.to(id).emit('playerMoved', {
        id: botId,
        userId: botId,
        username: bot.username,
        position: newPosition,
        velocity,
        cameraDirection,
      });
    }

    if (!nearestTarget) return;

    await this.combatService.handleShoot(
      { id: botId, username: bot.username },
      roomId,
      {
        rayOrigin: { x: newPosition.x, y: newPosition.y, z: newPosition.z },
        rayDirection: { x: cameraDirection.x, y: cameraDirection.y, z: cameraDirection.z },
      },
      server,
    );
  }

  onModuleDestroy(): void {
    for (const interval of this.roomIntervals.values()) clearInterval(interval);
    this.roomIntervals.clear();
  }
}
