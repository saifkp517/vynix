import {
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { Vector3 } from 'three';

import { RoomsService } from './rooms/rooms.service';
import { PlayersService } from './players/players.service';
import { RedisService } from './redis/redis.service';
import { MatchmakingService } from './matchmaking/matchmaking.service';
import { PhysicsService } from './physics/physics.service';

// Diagnostic harness — runs on every server start and reports PASS/FAIL for
// each implemented service method. Remove or gate behind NODE_ENV before prod.

@Injectable()
export class GameService implements OnModuleInit {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly playersService: PlayersService,
    private readonly redisService: RedisService,
    private readonly matchmakingService: MatchmakingService,
    private readonly physicsService: PhysicsService
  ) {}

  async onModuleInit() {
    await this.runDiagnostics();
  }

  // ── Logging ──────────────────────────────────────────────────────────────────

  private section(name: string) {
    console.log(`\n[Diag] ───── ${name} ─────`);
  }

  private pass(label: string, detail?: any) {
    const suffix =
      detail !== undefined ? `: ${JSON.stringify(detail)}` : '';
    console.log(`[Diag]   ✓  ${label}${suffix}`);
  }

  private fail(label: string, err: any) {
    console.error(
      `[Diag]   ✗  ${label} — ${err?.message ?? String(err)}`,
    );
  }

  private info(label: string, value: any) {
    console.log(`[Diag]      ${label}:`, value);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private makePlayer(socketId: string, room: string, n: number) {
    return {
      socketId,
      userId: `test-user-${n}`,
      room,
      username: `TestPlayer${n}`,
      position: new Vector3(n * 20, 0, n * 10),
      velocity: new Vector3(0, 0, 0),
      cameraDirection: new Vector3(0, 0, 1),
      health: 100,
      isDead: false,
      kills: 0,
      deaths: 0,
    };
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────────

  private async runDiagnostics() {
    console.log('\n[Diag] ══════ Startup Diagnostics ══════');

    const SOCKET_A = 'diag-socket-1';
    const SOCKET_B = 'diag-socket-2';
    let roomId: string;

    // ── RoomsService ────────────────────────────────────────────────────────────

    this.section('RoomsService');

    try {
      roomId = await this.roomsService.createRoom();
      this.pass('createRoom', roomId);
    } catch (err) {
      this.fail('createRoom', err);
      console.error('[Diag] Cannot continue without a room. Aborting.');
      return;
    }

    try {
      const rooms = await this.roomsService.getAllRooms();
      this.pass(`getAllRooms → ${rooms.length} room(s)`);
      this.info('rooms', rooms);
    } catch (err) {
      this.fail('getAllRooms', err);
    }

    try {
      // 0 players → findAvailableRoom requires >= 2, must return null
      const available = await this.roomsService.findAvailableRoom();
      if (available === null) {
        this.pass('findAvailableRoom (0 players) → null (expected)');
      } else {
        this.fail(
          'findAvailableRoom (0 players)',
          `expected null, got ${available}`,
        );
      }
    } catch (err) {
      this.fail('findAvailableRoom (0 players)', err);
    }

    // ── PlayersService ──────────────────────────────────────────────────────────

    this.section('PlayersService');

    const playerA = this.makePlayer(SOCKET_A, roomId, 1);
    const playerB = this.makePlayer(SOCKET_B, roomId, 2);

    try {
      await this.playersService.setPlayerInRoom(playerA);
      this.pass(`setPlayerInRoom → ${SOCKET_A}`);
    } catch (err) {
      this.fail(`setPlayerInRoom (${SOCKET_A})`, err);
    }

    try {
      await this.playersService.setPlayerInRoom(playerB);
      this.pass(`setPlayerInRoom → ${SOCKET_B}`);
    } catch (err) {
      this.fail(`setPlayerInRoom (${SOCKET_B})`, err);
    }

    try {
      const fetched = await this.playersService.getPlayerFromRoom(
        roomId,
        SOCKET_A,
      );
      if (
        fetched &&
        fetched.username === playerA.username &&
        fetched.health === 100 &&
        fetched.position instanceof Vector3
      ) {
        this.pass('getPlayerFromRoom → deserialization OK');
        this.info('player', {
          username: fetched.username,
          health: fetched.health,
          position: fetched.position,
        });
      } else {
        this.fail(
          'getPlayerFromRoom',
          `unexpected result: ${JSON.stringify(fetched)}`,
        );
      }
    } catch (err) {
      this.fail('getPlayerFromRoom', err);
    }

    try {
      const missing = await this.playersService.getPlayerFromRoom(
        roomId,
        'nonexistent-socket',
      );
      if (missing === null) {
        this.pass('getPlayerFromRoom (missing) → null (expected)');
      } else {
        this.fail(
          'getPlayerFromRoom (missing)',
          `expected null, got ${JSON.stringify(missing)}`,
        );
      }
    } catch (err) {
      this.fail('getPlayerFromRoom (missing)', err);
    }

    try {
      const all = await this.playersService.getAllPlayersFromRoom(roomId);
      const count = Object.keys(all).length;
      if (count === 2) {
        this.pass(`getAllPlayersFromRoom (pipeline) → ${count} players (expected: 2)`);
      } else {
        this.fail(
          'getAllPlayersFromRoom',
          `got ${count} players, expected 2`,
        );
      }
    } catch (err) {
      this.fail('getAllPlayersFromRoom (pipeline)', err);
    }

    try {
      await this.playersService.updatePlayerInRoom(roomId, SOCKET_A, {
        health: 75,
        kills: 2,
      });
      const updated = await this.playersService.getPlayerFromRoom(
        roomId,
        SOCKET_A,
      );
      if (updated?.health === 75 && updated?.kills === 2) {
        this.pass('updatePlayerInRoom → health=75, kills=2 (expected)');
      } else {
        this.fail(
          'updatePlayerInRoom',
          `unexpected state: ${JSON.stringify(updated)}`,
        );
      }
    } catch (err) {
      this.fail('updatePlayerInRoom', err);
    }

    // ── RoomsService (with 2 players) ───────────────────────────────────────────

    this.section('RoomsService (2 players present)');

    try {
      const available = await this.roomsService.findAvailableRoom();
      if (available === roomId) {
        this.pass(`findAvailableRoom (2 players) → ${available} (expected)`);
      } else {
        this.fail(
          'findAvailableRoom (2 players)',
          `got ${available}, expected ${roomId}`,
        );
      }
    } catch (err) {
      this.fail('findAvailableRoom (2 players)', err);
    }

    // ── MatchmakingService ──────────────────────────────────────────────────────

    this.section('MatchmakingService');

    const POOL_SOCKET_A = 'pool-socket-a';
    const POOL_SOCKET_B = 'pool-socket-b';

    try {
      const count = await this.matchmakingService.addToWaitPool(POOL_SOCKET_A);
      if (count >= 1) {
        this.pass(`addToWaitPool (${POOL_SOCKET_A}) → pool size ${count}`);
      } else {
        this.fail('addToWaitPool', `expected count >= 1, got ${count}`);
      }
    } catch (err) {
      this.fail('addToWaitPool', err);
    }

    try {
      const count = await this.matchmakingService.addToWaitPool(POOL_SOCKET_B);
      if (count >= 2) {
        this.pass(`addToWaitPool (${POOL_SOCKET_B}) → pool size ${count}`);
      } else {
        this.fail('addToWaitPool (second)', `expected count >= 2, got ${count}`);
      }
    } catch (err) {
      this.fail('addToWaitPool (second)', err);
    }

    try {
      const count = await this.matchmakingService.getPoolCount();
      this.pass(`getPoolCount → ${count}`);
    } catch (err) {
      this.fail('getPoolCount', err);
    }

    try {
      await this.matchmakingService.removeFromWaitPool(POOL_SOCKET_B);
      const countAfter = await this.matchmakingService.getPoolCount();
      this.pass(`removeFromWaitPool (${POOL_SOCKET_B}) → pool size now ${countAfter}`);
    } catch (err) {
      this.fail('removeFromWaitPool', err);
    }

    try {
      // Re-add B so pool has both sockets for drainPool test
      await this.matchmakingService.addToWaitPool(POOL_SOCKET_B);
      const drained = await this.matchmakingService.drainPool();
      if (
        drained.length === 2 &&
        drained.includes(POOL_SOCKET_A) &&
        drained.includes(POOL_SOCKET_B)
      ) {
        this.pass(`drainPool → [${drained.join(', ')}] (expected both sockets)`);
      } else {
        this.fail('drainPool', `got [${drained.join(', ')}]`);
      }
      const countAfterDrain = await this.matchmakingService.getPoolCount();
      if (countAfterDrain === 0) {
        this.pass('drainPool → pool empty after drain (expected)');
      } else {
        this.fail('drainPool (pool empty check)', `pool still has ${countAfterDrain} entries`);
      }
    } catch (err) {
      this.fail('drainPool', err);
    }

    try {
      const spawnPoint = await this.physicsService.getSpawnPosition(roomId);
      if (spawnPoint instanceof Vector3) {
        this.pass('getSpawnPosition → Vector3 OK');
        this.info('spawnPoint', { x: spawnPoint.x, y: spawnPoint.y, z: spawnPoint.z });
      } else {
        this.fail('getSpawnPosition', `not a Vector3: ${JSON.stringify(spawnPoint)}`);
      }
    } catch (err) {
      this.fail('getSpawnPosition', err);
    }

    try {
      const mmRoomId = await this.roomsService.createRoom();
      const { player, spawnPoint } = await this.matchmakingService.enrollPlayer(
        'enroll-socket-test',
        'enroll-user-test',
        'EnrollTestPlayer',
        mmRoomId,
      );

      if (
        player.socketId === 'enroll-socket-test' &&
        player.health === 100 &&
        !player.isDead &&
        spawnPoint instanceof Vector3
      ) {
        this.pass('enrollPlayer → player enrolled, spawnPoint is Vector3');
      } else {
        this.fail('enrollPlayer', `unexpected result: ${JSON.stringify({ player, spawnPoint })}`);
      }

      // Clean up enrollPlayer test room
      await this.roomsService.removeRoom(mmRoomId);
      this.pass('removeRoom (enrollPlayer test room) → cleaned up');
    } catch (err) {
      this.fail('enrollPlayer', err);
    }

    // ── SocketStateService ──────────────────────────────────────────────────────

    this.section('SocketStateService');
    console.log(
      '[Diag]      Skipped — requires live socket connections (see test/socket-test.ts)',
    );

    // ── Gaps ─────────────────────────────────────────────────────────────────────

    this.section('Not yet implemented');
    [
      'PhysicsService              — rayIntersectsSphere, getCellKey, in-memory grid',
      'MovementService             — updatePositionAndCamera orchestration',
      'CombatService               — shoot / hit / death / respawn',
      'Auth on socket connect      — handleConnection has no session validation (BUG-01)',
      'Stats flush on game-over    — blocked on PrismaService',
      'REST API                    — no controllers exist yet',
    ].forEach((item) => console.log(`[Diag]      - ${item}`));

    // ── Cleanup ───────────────────────────────────────────────────────────────────

    this.section('Cleanup');

    try {
      await this.redisService.del(
        `player:${roomId}:${SOCKET_A}`,
        `player:${roomId}:${SOCKET_B}`,
        `roomPlayers:${roomId}`,
      );
      await this.redisService.sRem('rooms', roomId);
      this.pass('Test keys removed from Redis');
    } catch (err) {
      this.fail('Cleanup', err);
    }

    console.log('\n[Diag] ══════ Diagnostics complete ══════\n');
  }
}
