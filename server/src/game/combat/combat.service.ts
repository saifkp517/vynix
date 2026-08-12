import { Injectable } from '@nestjs/common';
import { Vector3 } from 'three';
import { Server } from 'socket.io';

import { RedisService } from '../redis/redis.service';
import { PlayersService } from '../players/players.service';
import { PhysicsService } from '../physics/physics.service';
import {
  type ShooterIdentity,
  type ShootObject,
  PLAYER_HITBOX_RADIUS,
  PLAYER_HITBOX_Y_OFFSET,
  PLAYER_RADIUS,
} from '../players/players.types';

const DAMAGE_PER_HIT = 10;
const RESPAWN_DELAY_MS = 5000;

// Lag compensation: a real shooter's shot is tested against where the target
// actually was ~this long ago (per PhysicsService's position history), not
// where the target is right now — closing the gap between what the shooter
// saw on their screen and what the server hit-tests against. Bots skip this
// entirely: a bot's ray is built from the same-tick position it fires with,
// so there's no client-render lag to compensate for.
const SHOT_REWIND_MS = 500; // TEMP: zeroed to rule out lag-compensation as the cause of missed hits

// Regen: once a real player has gone this long without taking a hit, heal
// them 1hp/100ms (10hp/sec) until back to full health, so it reads as a
// smooth climb rather than a stepped one. Reset by any hit (see `lastHitAt`
// stamp in handleShoot). Each tick is a targeted per-player emit (server.to
// a single socket, ~40-byte payload) that stops firing entirely once a
// player is at full health, so cost is bounded by how many real players are
// actively mid-heal at once, not room size — but at 10 emits/sec per healer
// this is the priciest per-player event in the codebase; if that ever
// matters (many concurrent healers), switch to one `healthRegenStart` event
// + client-side local tween instead of ticking the network every 100ms.
const REGEN_IDLE_MS = 10_000;
const REGEN_TICK_MS = 100;
const REGEN_AMOUNT = 1;
const MAX_HEALTH = 100;

// Invincibility ability: press-to-activate, 5s of full damage immunity,
// 10s cooldown before it can be used again. Cooldown is enforced here
// (not just client-side) so a modified client can't spam it.
const INVINCIBILITY_DURATION_MS = 5_000;
const ABILITY_COOLDOWN_MS = 10_000;

@Injectable()
export class CombatService {
  private readonly regenIntervals = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly redisService: RedisService,
    private readonly playersService: PlayersService,
    private readonly physicsService: PhysicsService,
  ) {}

  private playerKey(roomId: string, socketId: string) {
    return `player:${roomId}:${socketId}`;
  }

  /** Starts this room's regen tick. No-op if already running. */
  startRegen(roomId: string, server: Server): void {
    if (this.regenIntervals.has(roomId)) return;

    const interval = setInterval(() => {
      this.tickRegen(roomId, server).catch((err) =>
        console.error(`[Regen] tickRegen(${roomId}) threw:`, err),
      );
    }, REGEN_TICK_MS);

    this.regenIntervals.set(roomId, interval);
  }

  stopRegen(roomId: string): void {
    const interval = this.regenIntervals.get(roomId);
    if (interval) {
      clearInterval(interval);
      this.regenIntervals.delete(roomId);
    }
  }

  private async tickRegen(roomId: string, server: Server): Promise<void> {
    const players = await this.playersService.getAllPlayersFromRoom(roomId);
    const now = Date.now();

    for (const [playerId, player] of Object.entries(players)) {
      // Bots don't regen — only real players should visibly heal over time.
      if (player.isBot || player.isDead) continue;
      if (player.health >= MAX_HEALTH) continue;
      if (now - player.lastHitAt < REGEN_IDLE_MS) continue;

      const key = this.playerKey(roomId, playerId);
      const newHealth = Math.min(
        MAX_HEALTH,
        await this.redisService.hIncrBy(key, 'health', REGEN_AMOUNT),
      );

      server.to(playerId).emit('healthRegen', { id: playerId, health: newHealth });
    }
  }

  /**
   * Activates the invincibility ability for a player, if it's not on
   * cooldown. Emits `abilityActivated` (roomwide, so others can render the
   * shield effect) on success or `abilityOnCooldown` (to the caller only)
   * on failure.
   */
  async activateInvincibility(
    roomId: string,
    playerId: string,
    server: Server,
  ): Promise<void> {
    const player = await this.playersService.getPlayerFromRoom(roomId, playerId);
    if (!player || player.isDead) return;

    const now = Date.now();
    if (now < player.abilityCooldownUntil) {
      server.to(playerId).emit('abilityOnCooldown', {
        remainingMs: player.abilityCooldownUntil - now,
      });
      return;
    }

    const invincibleUntil = now + INVINCIBILITY_DURATION_MS;
    const abilityCooldownUntil = now + ABILITY_COOLDOWN_MS;

    const key = this.playerKey(roomId, playerId);
    await this.redisService.hSet(key, {
      invincibleUntil: String(invincibleUntil),
      abilityCooldownUntil: String(abilityCooldownUntil),
    });

    server.to(roomId).emit('abilityActivated', {
      id: playerId,
      invincibleUntil,
      abilityCooldownUntil,
    });
  }

  async handleShoot(
    shooter: ShooterIdentity,
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

    // Cosmetic-only origin for other clients' tracers/muzzle flash — the
    // aim ray above is camera-based and must never be rendered, or remote
    // shots would visibly originate from above the shooter's head.
    const muzzleOrigin = new Vector3(
      shootObject.muzzleOrigin.x,
      shootObject.muzzleOrigin.y,
      shootObject.muzzleOrigin.z,
    );

    // BUG-04 fix: broadcast playerShot once before the per-player loop
    const cellKey = this.physicsService.getCellKey(roomId, rayOrigin);
    const nearbyIds = this.physicsService.getNearbySocketIds(
      roomId,
      shooter.id,
      cellKey,
    );
    for (const id of nearbyIds) {
      server.to(id).emit('playerShot', {
        id: shooter.id,
        rayOrigin: muzzleOrigin,
        rayDirection,
      });
    }

    const players = await this.playersService.getAllPlayersFromRoom(roomId);
    // Bots build their ray from the same tick's position, so there's no
    // render lag on their end to compensate for — only rewind for shots
    // fired by real clients.
    const rewindTo = shooter.isBot ? null : Date.now() - SHOT_REWIND_MS;

    for (const [playerId, player] of Object.entries(players)) {
      // BUG-05 fix: compare socketId to socketId, not socketId to userId
      if (playerId === shooter.id) continue;

      // Hit-test against where the target actually was at shot-time, not
      // their current position, so the shooter's screen and the server's
      // hit-scan agree — falls back to the live position if no history is
      // buffered yet (e.g. target just spawned).
      const hitTestPosition =
        (rewindTo !== null && this.physicsService.getPositionAt(playerId, rewindTo)) ||
        player.position;

      const playerCenter = new Vector3(
        hitTestPosition.x,
        hitTestPosition.y - PLAYER_HITBOX_Y_OFFSET,
        hitTestPosition.z,
      );

      // Vertical capsule, not a sphere: horizontal (XZ) aim still has to be
      // accurate to PLAYER_RADIUS, but vertical aim gets the generous
      // PLAYER_HITBOX_RADIUS forgiveness — see PLAYER_HITBOX_RADIUS's comment.
      const { hit, distance } = this.physicsService.rayIntersectsVerticalCapsule(
        rayOrigin,
        rayDirection,
        playerCenter,
        PLAYER_RADIUS,
        PLAYER_HITBOX_RADIUS,
      );

      if (!hit) continue;

      if (this.physicsService.isPathOccluded(rayOrigin, rayDirection, distance)) {
        continue;
      }

      if (Date.now() < player.invincibleUntil) {
        // Shot connects but does nothing — let the client show a "blocked"
        // spark instead of blood so it doesn't look like the bullet vanished.
        server.to(playerId).emit('hitBlocked', { rayOrigin });
        continue;
      }

      const key = this.playerKey(roomId, playerId);
      const newHealth = Math.max(
        0,
        await this.redisService.hIncrBy(key, 'health', -DAMAGE_PER_HIT),
      );
      // Reset the regen clock — any hit, even a non-lethal one, restarts the
      // 60s idle window before health starts climbing back up.
      await this.redisService.hSet(key, { lastHitAt: String(Date.now()) });

      // Health is authoritative from here on — the client used to guess its
      // own post-hit health by subtracting a hardcoded amount locally, which
      // drifted from Redis truth the moment a 'hit' event was dropped,
      // reordered, or DAMAGE_PER_HIT changed. Sending the real number closes
      // that gap the same way opponent positions already get corrected
      // toward server snapshots instead of purely dead-reckoned.
      server.to(playerId).emit('hit', { rayOrigin, health: newHealth });
      server.to(roomId).emit('playerHitReaction', { targetId: playerId });
      // Confirms the shot to the shooter — drives the crosshair hit-marker,
      // replacing the old client-side speculative prediction.
      server.to(shooter.id).emit('youHit', { targetId: playerId });

      if (newHealth > 0) continue;

      // Health reached zero — attempt to claim the kill atomically
      await this.tryKill({
        key,
        roomId,
        playerId,
        player,
        shooter,
        server,
      });
    }
  }

  private async tryKill({
    key,
    roomId,
    playerId,
    player,
    shooter,
    server,
  }: {
    key: string;
    roomId: string;
    playerId: string;
    player: { username: string };
    shooter: ShooterIdentity;
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
        this.playerKey(roomId, shooter.id),
        'kills',
        1,
      );
      multi.hincrby(key, 'deaths', 1);

      const result = await multi.exec();

      if (result === null) {
        // WATCH was triggered — another write won the race; retry
        continue;
      }

      // This caller won — emit death events. Deliberately NOT removing the
      // victim from the spatial grid here: grid membership only drives
      // playerMoved broadcast fan-out (see PhysicsService.getNearbySocketIds),
      // not hit detection, and removing them stops the killer's movement
      // updates from reaching the corpse — freezing KillCam on the client
      // mid-chase. Leaving their stale grid entry in place keeps them
      // receiving nearby updates until they move again post-respawn, at
      // which point updatePlayerCell relocates/refreshes it naturally.

      server.to(playerId).emit('youDied', { message: 'You are dead!' });
      server.to(roomId).emit('playerDead', {
        killerSocketId: shooter.id,
        victimSocketId: playerId,
        killerName: shooter.username,
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
          lastHitAt: String(Date.now()),
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
