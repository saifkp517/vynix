import { Injectable, Logger } from '@nestjs/common';
import { Vector3 } from 'three';
import { readFileSync } from 'fs';
import { join } from 'path';

import { PlayersService } from '../players/players.service';
import { TerrainService, MAX_TERRAIN_HEIGHT } from '../terrain/terrain.service';

type Grid = Map<string, Set<string>>;

interface RockObstacle {
  center: Vector3;
  // Half-extents along the rock's own local axes (before rotation).
  halfExtents: Vector3;
  rotationY: number;
}

// Mirrors client/components/game-components/obstacles/Rock.tsx's
// rockTransform(). Rocks are solid cover — shots and bot sightlines must
// treat them the same way the client's visible/collidable rock does, or a
// player crouched behind one can get shot through it. Keep these three
// values (and the baseScale = scale * 1.2 formula below) in sync with that
// file the same way terrain constants are kept in sync with Ground.tsx.
const ROCK_SIZE: [number, number, number] = [58.0, 60.0, 42.0];
const ROCK_EMBED_FRACTION = 0.45;

// Step size for walking a shot's ray to check whether terrain occludes it.
// Small enough to catch ridgelines, large enough to stay cheap per shot.
const TERRAIN_SAMPLE_STEP = 2;

interface PositionSnapshot {
  position: Vector3;
  time: number;
}

// How far back lag-compensated hit detection is allowed to rewind a target.
// Anything older than this is dropped from the buffer — no point keeping it,
// and it caps how far back a shot can ever be tested against.
const POSITION_HISTORY_MAX_AGE_MS = 400;

@Injectable()
export class PhysicsService {
  private readonly logger = new Logger(PhysicsService.name);
  private readonly grid: Grid = new Map();
  // Per-player recent position history, used to rewind a target to where
  // they were at shot-time instead of testing against their current (later)
  // position — see getPositionAt / CombatService.handleShoot.
  private readonly positionHistory = new Map<string, PositionSnapshot[]>();
  private readonly rocks: RockObstacle[] = [];

  constructor(
    private readonly playersService: PlayersService,
    private readonly terrainService: TerrainService,
  ) {
    this.loadRocks();
  }

  // ── Vegetation obstacles (rocks) ────────────────────────────────────────────

  /**
   * Reads the same POS.json the client renders from and builds world-space
   * rock ellipsoids out of the 'rock' entries, so shots and bot line-of-sight
   * can be blocked by rocks the same way they're already blocked by terrain.
   * Trees are deliberately not included here — they're thin enough that
   * blocking sightlines through a whole forest would make fights unplayable;
   * only rocks (wide, meant as cover) get server-side occlusion.
   */
  private loadRocks(): void {
    // process.cwd() only resolves correctly if the server is launched from
    // server/ (true for `npm run start:dev` there, not guaranteed for every
    // way this could be started — a monorepo script, a different working
    // directory, etc). __dirname is relative to this compiled/ts-node file
    // instead, which is stable regardless of launch cwd, but differs between
    // `ts-node` (runs from src/) and `nest build` (runs from dist/, which may
    // or may not preserve the src/ nesting depth). Trying all three covers
    // every way this service actually gets started; if all fail, rocks just
    // don't occlude yet and the warning below says why.
    const candidates = [
      join(process.cwd(), '..', 'client', 'public', 'POS.json'),
      join(__dirname, '../../../../client/public/POS.json'), // ts-node: src/game/physics
      join(__dirname, '../../../client/public/POS.json'), // nest build: dist/game/physics
    ];

    let raw: string | null = null;
    let loadedFrom = '';
    for (const candidate of candidates) {
      try {
        raw = readFileSync(candidate, 'utf-8');
        loadedFrom = candidate;
        break;
      } catch {
        // try the next candidate
      }
    }

    if (!raw) {
      this.logger.warn(
        `Could not find POS.json in any candidate location (tried: ${candidates.join(', ')}). Rocks won't occlude shots or bot line-of-sight until this is fixed.`,
      );
      return;
    }

    try {
      const vegetation: { type: string; position: [number, number, number]; rotation: number; scale: number }[] =
        JSON.parse(raw);

      for (const entry of vegetation) {
        if (entry.type !== 'rock') continue;

        const baseScale = entry.scale * 1.2;
        const groundHeight = this.terrainService.getHeight(entry.position[0], entry.position[2]);
        const halfExtents = new Vector3(
          (ROCK_SIZE[0] * baseScale) / 2,
          (ROCK_SIZE[1] * baseScale) / 2,
          (ROCK_SIZE[2] * baseScale) / 2,
        );
        const centerY =
          groundHeight + halfExtents.y - ROCK_SIZE[1] * baseScale * ROCK_EMBED_FRACTION;

        this.rocks.push({
          center: new Vector3(entry.position[0], centerY, entry.position[2]),
          halfExtents,
          rotationY: entry.rotation,
        });
      }

      this.logger.log(`Loaded ${this.rocks.length} rock obstacles for occlusion/avoidance from ${loadedFrom}`);
    } catch (err) {
      // Non-fatal: worst case, rocks don't block shots/sightlines yet — the
      // rest of the server has no other dependency on this data.
      this.logger.warn(`Could not load rock obstacles from POS.json: ${(err as Error).message}`);
    }
  }

  getRocks(): readonly RockObstacle[] {
    return this.rocks;
  }

  /** Ray vs a single rock ellipsoid, accounting for its Y rotation. */
  private isRayOccludedByRock(
    rayOrigin: Vector3,
    rayDirection: Vector3,
    distance: number,
    rock: RockObstacle,
  ): boolean {
    // Transform into the rock's local (unrotated, centered) frame.
    const cos = Math.cos(-rock.rotationY);
    const sin = Math.sin(-rock.rotationY);

    const rel = rayOrigin.clone().sub(rock.center);
    const localOrigin = new Vector3(rel.x * cos + rel.z * sin, rel.y, -rel.x * sin + rel.z * cos);
    const localDir = new Vector3(
      rayDirection.x * cos + rayDirection.z * sin,
      rayDirection.y,
      -rayDirection.x * sin + rayDirection.z * cos,
    );

    // Scale space so the ellipsoid becomes a unit sphere, then solve the
    // standard ray-sphere quadratic.
    const ox = localOrigin.x / rock.halfExtents.x;
    const oy = localOrigin.y / rock.halfExtents.y;
    const oz = localOrigin.z / rock.halfExtents.z;
    const dx = localDir.x / rock.halfExtents.x;
    const dy = localDir.y / rock.halfExtents.y;
    const dz = localDir.z / rock.halfExtents.z;

    const a = dx * dx + dy * dy + dz * dz;
    if (a === 0) return false;
    const b = 2 * (ox * dx + oy * dy + oz * dz);
    const c = ox * ox + oy * oy + oz * oz - 1;

    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return false;

    const sqrtDisc = Math.sqrt(discriminant);
    const t0 = (-b - sqrtDisc) / (2 * a);
    const t1 = (-b + sqrtDisc) / (2 * a);

    // Occluded if the entry point of the ellipsoid lies strictly between the
    // ray's origin and the target, in "local" t (same units as rayDirection,
    // which is a unit vector, so t is a world-space distance).
    const tEntry = Math.min(t0, t1);
    return tEntry > 0 && tEntry < distance;
  }

  /**
   * True if terrain OR a rock blocks the straight line from `rayOrigin` to a
   * point `distance` away along `rayDirection`. The single check callers
   * (shot resolution, bot line-of-sight) should use instead of terrain-only
   * occlusion, now that rocks are real cover.
   */
  isPathOccluded(rayOrigin: Vector3, rayDirection: Vector3, distance: number): boolean {
    if (this.isRayOccludedByTerrain(rayOrigin, rayDirection, distance)) return true;

    for (const rock of this.rocks) {
      if (this.isRayOccludedByRock(rayOrigin, rayDirection, distance, rock)) return true;
    }

    return false;
  }

  /**
   * Returns a steering position to route around any rock sitting in the
   * straight line between `from` and `to`, or `to` unchanged if the path is
   * clear. Used by bot movement so bots walk around rocks (which are now
   * solid cover) instead of beelining through them.
   */
  steerAroundRocks(from: Vector3, to: Vector3): Vector3 {
    const toTarget = to.clone().sub(from);
    const distance = toTarget.length();
    if (distance < 0.01) return to;
    const direction = toTarget.clone().divideScalar(distance);

    for (const rock of this.rocks) {
      if (!this.isRayOccludedByRock(from, direction, distance, rock)) continue;

      // Steer laterally around the rock: perpendicular to the approach
      // direction, on whichever side is closer to the bot's current heading
      // (so it doesn't flip-flop side to side across ticks).
      const toRock = rock.center.clone().sub(from);
      const lateral = new Vector3(-direction.z, 0, direction.x);
      const side = Math.sign(toRock.dot(lateral)) || 1;

      // Clear the rock's largest horizontal extent with margin, so the
      // detour point sits outside the ellipsoid rather than grazing it.
      const clearance = Math.max(rock.halfExtents.x, rock.halfExtents.z) * 1.3;
      return from.clone().addScaledVector(direction, distance * 0.4).addScaledVector(lateral, -side * clearance);
    }

    return to;
  }

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

    return this.getNearbySocketIds(roomId, socketId, cellKey);
  }

  removeFromGrid(socketId: string): void {
    this.clearPositionHistory(socketId);

    for (const [key, set] of this.grid) {
      if (set.has(socketId)) {
        set.delete(socketId);
        if (set.size === 0) this.grid.delete(key);
        return;
      }
    }
  }

  // ── Position history (lag compensation) ─────────────────────────────────────

  /** Records a position sample and trims anything older than the buffer needs. */
  recordPosition(socketId: string, position: Vector3, time: number = Date.now()): void {
    let history = this.positionHistory.get(socketId);
    if (!history) {
      history = [];
      this.positionHistory.set(socketId, history);
    }

    history.push({ position: position.clone(), time });

    const cutoff = time - POSITION_HISTORY_MAX_AGE_MS;
    while (history.length > 1 && history[0].time < cutoff) history.shift();
  }

  clearPositionHistory(socketId: string): void {
    this.positionHistory.delete(socketId);
  }

  /**
   * Returns the target's interpolated position at `time` (typically
   * `now - rewindMs`), for testing a shot against where they actually were
   * instead of where they are now. Falls back to the newest/oldest sample if
   * `time` falls outside the buffered range, and to `null` if nothing's
   * buffered yet (caller should fall back to the live position).
   */
  getPositionAt(socketId: string, time: number): Vector3 | null {
    const history = this.positionHistory.get(socketId);
    if (!history || history.length === 0) return null;

    if (time <= history[0].time) return history[0].position.clone();
    const last = history[history.length - 1];
    if (time >= last.time) return last.position.clone();

    for (let i = 1; i < history.length; i++) {
      const next = history[i];
      if (next.time < time) continue;

      const prev = history[i - 1];
      const span = next.time - prev.time;
      const t = span > 0 ? (time - prev.time) / span : 0;
      return prev.position.clone().lerp(next.position, t);
    }

    return last.position.clone();
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

    // Widened from 50 — at 50 a full room (up to ~20 bots+players in the
    // 200x200 map) packed tightly enough that spawns/respawns often landed
    // bots right next to each other, so idle bots would immediately lock
    // onto the nearest bot instead of drifting toward the player.
    const MIN_DISTANCE = 70;
    const MAX_ATTEMPTS = 50;

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
      // Along-ray distance to the closest approach, not the perpendicular
      // miss distance — callers (e.g. terrain occlusion) walk the ray by
      // this length, so it must be a travel distance, not distanceToCenter.
      distance: projectionLength,
    };
  }

  /**
   * Walks the ray up to `distance` in fixed steps and checks whether it dips
   * below ground height at any sample point — i.e. whether a hill sits
   * between the shooter and the point being tested. Used to stop shots from
   * registering through terrain (e.g. two players on opposite sides of a hill).
   */
  isRayOccludedByTerrain(
    rayOrigin: Vector3,
    rayDirection: Vector3,
    distance: number,
  ): boolean {
    // Since the ray is straight, its lowest y along the whole segment is at
    // one of its two endpoints. If even the lower endpoint stays above the
    // highest point the terrain could ever reach, no hill anywhere can be
    // poking into this ray — skip the sample walk entirely.
    const endY = rayOrigin.y + rayDirection.y * distance;
    if (Math.min(rayOrigin.y, endY) > MAX_TERRAIN_HEIGHT) return false;

    for (let traveled = TERRAIN_SAMPLE_STEP; traveled < distance; traveled += TERRAIN_SAMPLE_STEP) {
      const point = rayOrigin.clone().add(rayDirection.clone().multiplyScalar(traveled));
      const groundHeight = this.terrainService.getHeight(point.x, point.z);

      if (point.y < groundHeight) return true;
    }

    return false;
  }
}