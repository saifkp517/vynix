import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Vector3 } from 'three';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

import { PlayersService } from '../players/players.service';
import { MovementService } from '../movement/movement.service';
import { PhysicsService } from '../physics/physics.service';
import { CombatService } from '../combat/combat.service';
import { TerrainService } from '../terrain/terrain.service';
import { RoomsService } from '../rooms/rooms.service';
import { type Player, PLAYER_HEIGHT, PLAYER_HITBOX_Y_OFFSET } from '../players/players.types';
import {
  BOT_ID_PREFIX,
  BOT_TICK_MS,
  BOT_CLUSTER_CELL_SIZE,
  BOT_JOIN_DELAY_MIN_MS,
  BOT_JOIN_DELAY_MAX_MS,
  BOT_THINK_INTERVAL_MIN_MS,
  BOT_THINK_INTERVAL_MAX_MS,
  BOT_MOVE_SPEED_MIN,
  BOT_MOVE_SPEED_MAX,
  BOT_ENGAGEMENT_RADIUS_MIN,
  BOT_ENGAGEMENT_RADIUS_MAX,
  BOT_HOLD_DISTANCE_MIN,
  BOT_HOLD_DISTANCE_MAX,
  BOT_REACTION_DELAY_MIN_MS,
  BOT_REACTION_DELAY_MAX_MS,
  BOT_ENGAGED_FIRE_COOLDOWN_MIN_MS,
  BOT_ENGAGED_FIRE_COOLDOWN_MAX_MS,
  BOT_AIM_ERROR_MAX_RAD,
  BOT_ROAM_OFFSET_RADIUS,
  BOT_MAX_ENGAGERS_PER_TARGET,
  BOT_LOW_HEALTH_THRESHOLD_MIN,
  BOT_LOW_HEALTH_THRESHOLD_MAX,
  BOT_LOW_HEALTH_THRESHOLD_ABS_MAX,
  BOT_FLEE_SAFE_DISTANCE,
  BOT_HEAL_AMOUNT_PER_TICK,
  BOT_VENGEANCE_RATE,
} from './bots.constants';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomJoinDelay = () =>
  BOT_JOIN_DELAY_MIN_MS +
  Math.random() * (BOT_JOIN_DELAY_MAX_MS - BOT_JOIN_DELAY_MIN_MS);
const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);
const randomThinkInterval = () =>
  randomBetween(BOT_THINK_INTERVAL_MIN_MS, BOT_THINK_INTERVAL_MAX_MS);

// A bot's behavioral state. Movement and state transitions run on every
// room tick regardless of state (so bots are always visibly moving); only
// fresh target *acquisition* while ROAMING is gated by the slower per-bot
// think cadence — see tickBot.
type BotFsmState = 'ROAMING' | 'HUNTING' | 'ENGAGED' | 'FLEEING' | 'HEALING';

// Per-bot personality/reaction traits, seeded once at spawn (scaled by
// BOT_VENGEANCE_RATE), plus the mutable bookkeeping needed to keep each bot
// deciding on its own independent clock instead of in lockstep with every
// other bot in the room.
interface BotState {
  fsmState: BotFsmState;
  moveSpeed: number;
  engagementRadius: number;
  holdDistance: number;
  reactionDelayMs: number;
  fireCooldownMs: number;
  lowHealthThreshold: number;
  aimErrorMaxRad: number;
  roamOffset: Vector3;
  nextThinkAt: number;
  lastFiredAt: number;
  targetAcquiredAt: number;
  velocity: Vector3;
  // Direction a FLEEING bot runs along — captured once when the flee
  // triggers so it's a straight line out, not re-aimed every tick as the
  // cluster centroid drifts.
  fleeDirection: Vector3 | null;
}

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
  // Sticky target lock per bot — kept until the target dies, leaves engagement
  // range, or terrain breaks line of sight, instead of re-picking nearest every tick.
  private readonly botTargets = new Map<string, string>();
  // Per-bot traits + independent think-timer state — see BotState.
  private readonly botStates = new Map<string, BotState>();

  constructor(
    private readonly playersService: PlayersService,
    private readonly movementService: MovementService,
    private readonly physicsService: PhysicsService,
    private readonly combatService: CombatService,
    private readonly terrainService: TerrainService,
    private readonly roomsService: RoomsService,
  ) {}

  /**
   * Trickles bots into the room one at a time on a random delay so it reads
   * as real players joining rather than a room instantly filling up. Does
   * not await the trickle itself — callers get control back immediately.
   */
  async fillRoom(roomId: string, targetCount: number, server: Server): Promise<void> {
    const players = await this.playersService.getAllPlayersFromRoom(roomId);
    const botsNeeded = targetCount - Object.keys(players).length;

    if (botsNeeded <= 0) return;

    this.startTicking(roomId, server);
    void this.trickleBots(roomId, botsNeeded, server);
  }

  private async trickleBots(roomId: string, count: number, server: Server): Promise<void> {
    for (let i = 0; i < count; i++) {
      await delay(randomJoinDelay());
      // Room may have ended (game-over cleanup / stopRoom) while we were
      // waiting — stop trickling instead of spawning bots into a dead room.
      if (!this.roomIntervals.has(roomId)) return;
      await this.spawnBot(roomId, server);
    }
  }

  stopRoom(roomId: string): void {
    const interval = this.roomIntervals.get(roomId);
    if (interval) {
      clearInterval(interval);
      this.roomIntervals.delete(roomId);
    }
  }

  /**
   * Stops ticking a room and forgets its bots' in-memory state (target locks,
   * traits). Called when a room has no real players left — no point paying
   * CPU/network for bots fighting each other with nobody watching. Redis
   * cleanup for the bot Player records happens via RoomsService.removeRoom,
   * called by the caller alongside this.
   */
  async destroyRoom(roomId: string): Promise<void> {
    const players = await this.playersService.getAllPlayersFromRoom(roomId);
    for (const [id, player] of Object.entries(players)) {
      if (player.isBot) {
        this.botStates.delete(id);
        this.botTargets.delete(id);
      }
    }
    this.stopRoom(roomId);
  }

  private async spawnBot(roomId: string, server: Server): Promise<void> {
    const botId = `${BOT_ID_PREFIX}${uuidv4()}`;
    const spawnPoint = await this.physicsService.getSpawnPosition(roomId);
    spawnPoint.y = this.terrainService.getHeight(spawnPoint.x, spawnPoint.z) + PLAYER_HEIGHT;

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
      lastHitAt: Date.now(), // unused — bots heal via their own FLEEING/HEALING states, not the regen loop
      invincibleUntil: 0,
      abilityCooldownUntil: 0,
    };

    await this.playersService.setPlayerInRoom(bot);
    this.physicsService.updatePlayerCell(roomId, botId, spawnPoint);

    this.botStates.set(botId, {
      fsmState: 'ROAMING',
      moveSpeed: randomBetween(BOT_MOVE_SPEED_MIN, BOT_MOVE_SPEED_MAX),
      // Not scaled by BOT_VENGEANCE_RATE — see constants file. Detection
      // range is what keeps fights 1-on-1 regardless of aggression level.
      engagementRadius: randomBetween(BOT_ENGAGEMENT_RADIUS_MIN, BOT_ENGAGEMENT_RADIUS_MAX),
      holdDistance: randomBetween(BOT_HOLD_DISTANCE_MIN, BOT_HOLD_DISTANCE_MAX),
      reactionDelayMs: randomBetween(BOT_REACTION_DELAY_MIN_MS, BOT_REACTION_DELAY_MAX_MS),
      fireCooldownMs:
        randomBetween(BOT_ENGAGED_FIRE_COOLDOWN_MIN_MS, BOT_ENGAGED_FIRE_COOLDOWN_MAX_MS) /
        BOT_VENGEANCE_RATE,
      lowHealthThreshold: Math.min(
        randomBetween(BOT_LOW_HEALTH_THRESHOLD_MIN, BOT_LOW_HEALTH_THRESHOLD_MAX) /
          BOT_VENGEANCE_RATE,
        BOT_LOW_HEALTH_THRESHOLD_ABS_MAX,
      ),
      // Higher vengeance = tighter aim cone (more accurate); lower = wider
      // spread. Clamped so a very low vengeance rate can't make bots
      // literally unable to hit anything.
      aimErrorMaxRad: Math.min(
        BOT_AIM_ERROR_MAX_RAD / BOT_VENGEANCE_RATE,
        BOT_AIM_ERROR_MAX_RAD * 4,
      ),
      roamOffset: new Vector3(
        randomBetween(-BOT_ROAM_OFFSET_RADIUS, BOT_ROAM_OFFSET_RADIUS),
        0,
        randomBetween(-BOT_ROAM_OFFSET_RADIUS, BOT_ROAM_OFFSET_RADIUS),
      ),
      // Staggered first think so freshly spawned bots don't all sync up
      // with each other or with bots that joined earlier.
      nextThinkAt: Date.now() + Math.random() * randomThinkInterval(),
      lastFiredAt: 0,
      targetAcquiredAt: 0,
      velocity: new Vector3(0, 0, 0),
      fleeDirection: null,
    });

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

    // Self-healing backstop: if a room somehow still has bots but no real
    // players (a missed disconnect event, a restart, a dev reload that never
    // fired handleDisconnect), the tick loop itself notices and tears the
    // room down instead of quietly grinding bot-vs-bot forever. This is the
    // same reap GameGateway.reapIfNoRealPlayersLeft does on disconnect — this
    // just covers every path that check can't see.
    const hasRealPlayer = entities.some(([, p]) => !p.isBot);
    if (!hasRealPlayer) {
      await this.destroyRoom(roomId);
      await this.roomsService.removeRoom(roomId);
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
    const state = this.botStates.get(botId);
    if (!state) return; // spawned before this tick's state map was populated

    const now = Date.now();

    // Health check runs every tick, independent of think cadence, so a bot
    // never keeps fighting a tick past its threshold just because it wasn't
    // its turn to "think" — the instant it's low, it breaks off.
    if (
      state.fsmState !== 'FLEEING' &&
      state.fsmState !== 'HEALING' &&
      bot.health > 0 &&
      bot.health <= state.lowHealthThreshold
    ) {
      state.fsmState = 'FLEEING';
      state.fleeDirection = this.computeFleeDirection(bot.position, cluster);
      this.botTargets.delete(botId);
      // Deterministic, not a coin flip — flee is always covered by
      // invincibility when it isn't on cooldown. activateInvincibility is a
      // no-op (emits abilityOnCooldown to a socket nobody's listening on) if
      // it's still cooling down, which is fine — the bot still runs either way.
      void this.combatService.activateInvincibility(roomId, botId, server);
    }

    if (state.fsmState === 'FLEEING' || state.fsmState === 'HEALING') {
      await this.tickRecovery(roomId, botId, bot, state, cluster, server);
      return;
    }

    // ---- ROAMING / HUNTING / ENGAGED ----

    const isEngageable = (id: string, entity: Player): number | null => {
      if (id === botId || entity.isDead) return null;

      const distance = bot.position.distanceTo(entity.position);
      if (distance > state.engagementRadius) return null;

      const aimPoint = entity.position.clone().setY(entity.position.y - PLAYER_HITBOX_Y_OFFSET);
      const direction = aimPoint.clone().sub(bot.position).normalize();
      if (this.physicsService.isRayOccludedByTerrain(bot.position, direction, distance)) {
        return null; // in range but a hill blocks line of sight
      }

      return distance;
    };

    // How many other bots are currently locked onto a given target — caps
    // pile-ons so no single entity (bot or real player) ever faces more than
    // BOT_MAX_ENGAGERS_PER_TARGET bots at once. Type-agnostic: bots and real
    // players are treated identically for targeting, no species preference.
    const engagerCounts = new Map<string, number>();
    for (const [otherBotId, targetId] of this.botTargets) {
      if (otherBotId === botId) continue;
      engagerCounts.set(targetId, (engagerCounts.get(targetId) ?? 0) + 1);
    }

    const entityMap = new Map(entities);
    const lockedId = this.botTargets.get(botId);
    let nearestTarget: { id: string; player: Player; distance: number } | null = null;

    if (lockedId) {
      const lockedEntity = entityMap.get(lockedId);
      const distance = lockedEntity ? isEngageable(lockedId, lockedEntity) : null;
      // Drop the lock only if the target died or left engagement range/LOS.
      // Otherwise the lock holds even if a *closer* target shows up — a bot
      // never abandons a fight mid-engagement just because someone nearer
      // walked by, regardless of whether either one is a bot or a player.
      if (lockedEntity && distance !== null) {
        nearestTarget = { id: lockedId, player: lockedEntity, distance };
      } else {
        this.botTargets.delete(botId);
      }
    }

    // Only scan for a *fresh* target while idle, and only on this bot's own
    // jittered cadence — this is the one thing still gated by think timing,
    // so a room full of bots doesn't all snap onto a newly-visible player on
    // the same tick. Movement below always runs regardless.
    if (!nearestTarget && now >= state.nextThinkAt) {
      state.nextThinkAt = now + randomThinkInterval();

      // Nearest engageable entity wins, bot or real player alike — no
      // species preference. Skip anyone already swarmed by enough other
      // bots so pile-ons stay capped regardless of target type.
      for (const [id, entity] of entities) {
        const distance = isEngageable(id, entity);
        if (distance === null) continue;
        if ((engagerCounts.get(id) ?? 0) >= BOT_MAX_ENGAGERS_PER_TARGET) continue;

        if (!nearestTarget || distance < nearestTarget.distance) {
          nearestTarget = { id, player: entity, distance };
        }
      }

      if (nearestTarget) {
        this.botTargets.set(botId, nearestTarget.id);
        state.targetAcquiredAt = now;
      }
    }

    let newPosition = bot.position.clone();
    let velocity = new Vector3(0, 0, 0);

    if (nearestTarget) {
      // Locked on someone — chase them if they drift back out past hold
      // distance, otherwise hold and just shoot. Never gives up until dead,
      // out of range, or terrain breaks line of sight (handled above).
      state.fsmState = nearestTarget.distance > state.holdDistance ? 'HUNTING' : 'ENGAGED';

      if (nearestTarget.distance > state.holdDistance) {
        const toTarget = nearestTarget.player.position.clone().sub(bot.position);
        toTarget.y = 0;
        if (toTarget.length() > 0.1) {
          const direction = toTarget.normalize();
          velocity = direction.multiplyScalar(state.moveSpeed);
          newPosition = bot.position.clone().add(velocity);
        }
      }
    } else {
      state.fsmState = 'ROAMING';
      // Roam toward the cluster centroid plus this bot's own persistent
      // offset, so idle bots spread out instead of stacking on one point.
      // Runs every tick (not gated by think cadence) so idle bots are
      // always visibly drifting instead of freezing between long pauses.
      const roamTarget = cluster.clone().add(state.roamOffset);
      const toRoamTarget = roamTarget.sub(bot.position);
      if (toRoamTarget.length() > 1) {
        const direction = toRoamTarget.normalize();
        velocity = direction.multiplyScalar(state.moveSpeed);
        newPosition = bot.position.clone().add(velocity);
      }
    }

    newPosition.y = this.terrainService.getHeight(newPosition.x, newPosition.z) + PLAYER_HEIGHT;
    state.velocity = velocity;

    let cameraDirection = nearestTarget
      ? nearestTarget.player.position
          .clone()
          .setY(nearestTarget.player.position.y - PLAYER_HITBOX_Y_OFFSET)
          .sub(newPosition)
          .normalize()
      : bot.cameraDirection;

    if (nearestTarget) {
      cameraDirection = this.applyAimError(cameraDirection, state.aimErrorMaxRad);
    }

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

    // Human-like reaction time before the first shot of an engagement, then
    // a tight per-bot cooldown between subsequent shots — every tick once
    // engaged, not paced to the (much slower) think cadence, so a locked-on
    // bot reads as relentless rather than taking occasional potshots.
    if (now - state.targetAcquiredAt < state.reactionDelayMs) return;
    if (now - state.lastFiredAt < state.fireCooldownMs) return;
    state.lastFiredAt = now;

    await this.combatService.handleShoot(
      { id: botId, username: bot.username },
      roomId,
      {
        rayOrigin: { x: newPosition.x, y: newPosition.y, z: newPosition.z },
        rayDirection: { x: cameraDirection.x, y: cameraDirection.y, z: cameraDirection.z },
        // Bots have no separate muzzle offset — fire origin doubles as the
        // cosmetic position broadcast to nearby clients.
        muzzleOrigin: { x: newPosition.x, y: newPosition.y, z: newPosition.z },
      },
      server,
    );
  }

  // Runs the FLEEING and HEALING states: sprint straight out along the
  // captured flee direction until clear of the fight, then sit and heal to
  // full before tickBot lets the bot resume hunting on the next tick.
  private async tickRecovery(
    roomId: string,
    botId: string,
    bot: Player,
    state: BotState,
    cluster: Vector3,
    server: Server,
  ): Promise<void> {
    if (state.fsmState === 'FLEEING') {
      const direction = state.fleeDirection ?? this.computeFleeDirection(bot.position, cluster);
      const velocity = direction.clone().multiplyScalar(state.moveSpeed);
      const newPosition = bot.position.clone().add(velocity);
      newPosition.y = this.terrainService.getHeight(newPosition.x, newPosition.z) + PLAYER_HEIGHT;
      state.velocity = velocity;

      const { nearbySocketIds } = await this.movementService.process(
        botId,
        roomId,
        newPosition,
        velocity,
        bot.cameraDirection,
      );

      for (const id of nearbySocketIds) {
        server.to(id).emit('playerMoved', {
          id: botId,
          userId: botId,
          username: bot.username,
          position: newPosition,
          velocity,
          cameraDirection: bot.cameraDirection,
        });
      }

      if (newPosition.distanceTo(cluster) >= BOT_FLEE_SAFE_DISTANCE) {
        state.fsmState = 'HEALING';
      }
      return;
    }

    // HEALING — hold position and climb back to full health before
    // resuming the hunt. No socket to target (bots don't get healthRegen
    // emits), so this just writes the new health straight to Redis.
    if (bot.health < 100) {
      const newHealth = Math.min(100, bot.health + BOT_HEAL_AMOUNT_PER_TICK);
      await this.playersService.updatePlayerInRoom(roomId, botId, { health: newHealth });
    }

    if (bot.health >= 100) {
      state.fsmState = 'ROAMING';
      state.fleeDirection = null;
    }
  }

  // Straight-line direction pointing away from the fight (the player
  // cluster), with a random fallback for the edge case where a bot IS the
  // cluster centroid (e.g. it's alone in the room).
  private computeFleeDirection(position: Vector3, cluster: Vector3): Vector3 {
    const direction = position.clone().sub(cluster);
    direction.y = 0;

    if (direction.lengthSq() < 0.01) {
      direction.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    }

    return direction.normalize();
  }

  // Perturbs an aim direction by a small random cone so bots don't land
  // pixel-perfect shots every time. errorMaxRad is per-bot, scaled by
  // BOT_VENGEANCE_RATE at spawn (see BotState.aimErrorMaxRad).
  private applyAimError(direction: Vector3, errorMaxRad: number): Vector3 {
    const errorX = (Math.random() - 0.5) * 2 * errorMaxRad;
    const errorY = (Math.random() - 0.5) * 2 * errorMaxRad;

    return direction
      .clone()
      .applyAxisAngle(new Vector3(0, 1, 0), errorX)
      .applyAxisAngle(new Vector3(1, 0, 0), errorY)
      .normalize();
  }

  onModuleDestroy(): void {
    for (const interval of this.roomIntervals.values()) clearInterval(interval);
    this.roomIntervals.clear();
  }
}
