import { Injectable, Logger } from '@nestjs/common';
import { Vector3 } from 'three';
import { readFileSync } from 'fs';
import { join } from 'path';

import { PlayersService } from '../players/players.service';
import { TerrainService, MAX_TERRAIN_HEIGHT } from '../terrain/terrain.service';
import {
  CANOPY_PLATE_RADIUS,
  CANOPY_PLATE_Y_OFFSET,
  CANOPY_PLATE_SCALE,
  TRUNK_COLLIDER_RADIUS,
  TRUNK_COLLIDER_HEIGHT,
  TRUNK_COLLIDER_RADIAL_SCALE,
  TOP_CANOPY_RADIUS,
  TOP_CANOPY_Y_OFFSET,
  TOP_CANOPY_SCALE,
} from '../../../../shared/treeConstants';

type Grid = Map<string, Set<string>>;

interface CanopyObstacle {
  center: Vector3;
  // Half-extents along the canopy's own local axes (before rotation).
  halfExtents: Vector3;
  rotationY: number;
}

interface TrunkObstacle {
  // Ground-level (x, z) center; the cylinder is axis-aligned along Y, so
  // rotation doesn't affect it.
  center: Vector3;
  radius: number;
  // World-space Y range the cylinder occupies.
  bottomY: number;
  topY: number;
}

/**
 * Mirrors getCanopyYOffset() in Tree.tsx: `canopyHeightOffset` is baked into
 * POS.json by generateTreePos.ts's proximity-aware tiering (trees close
 * enough for their canopies to overlap get pushed onto different height
 * tiers), not derived from a tree's own fields — so the server just reads
 * the same baked value the client does, rather than recomputing it.
 */
function getCanopyYOffset(entry: { canopyHeightOffset?: number }): number {
  return CANOPY_PLATE_Y_OFFSET + (entry.canopyHeightOffset ?? 0);
}

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
  private readonly canopies: CanopyObstacle[] = [];
  // Top canopy (the crown cluster above the trunk) — same CanopyObstacle
  // shape as the bottom plate, just a separate list so occlusion checks can
  // prefilter each independently (see isPathOccluded).
  private readonly topCanopies: CanopyObstacle[] = [];
  private readonly trunks: TrunkObstacle[] = [];

  constructor(
    private readonly playersService: PlayersService,
    private readonly terrainService: TerrainService,
  ) {
    this.loadCanopies();
  }

  // ── Vegetation obstacles (bottom canopy) ─────────────────────────────────────

  /**
   * Reads the same POS.json the client renders from and builds world-space
   * canopy ellipsoids for every tree, so shots and bot line-of-sight can be
   * blocked by the bottom canopy the same way they're already blocked by
   * terrain. Only the bottom canopy plate gets this — the trunk and upper
   * crown layers are thin enough that blocking sightlines through a whole
   * forest of them would make fights unplayable; the wide flat plate is the
   * one layer meant to work as cover.
   */
  private loadCanopies(): void {
    // process.cwd() only resolves correctly if the server is launched from
    // server/ (true for `npm run start:dev` there, not guaranteed for every
    // way this could be started — a monorepo script, a different working
    // directory, etc). __dirname is relative to this compiled/ts-node file
    // instead, which is stable regardless of launch cwd, but differs between
    // `ts-node` (runs from src/) and `nest build` (runs from dist/, which may
    // or may not preserve the src/ nesting depth). Trying all three covers
    // every way this service actually gets started; if all fail, canopies
    // just don't occlude yet and the warning below says why.
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
        `Could not find POS.json in any candidate location (tried: ${candidates.join(', ')}). Canopies won't occlude shots or bot line-of-sight until this is fixed.`,
      );
      return;
    }

    try {
      const vegetation: {
        type: string;
        position: [number, number, number];
        rotation: number;
        scale: number;
        canopyHeightOffset?: number;
      }[] = JSON.parse(raw);

      for (const entry of vegetation) {
        if (entry.type !== 'tree') continue;

        const baseScale = entry.scale * 1.2;
        const groundHeight = this.terrainService.getHeight(entry.position[0], entry.position[2]);
        const halfExtents = new Vector3(
          CANOPY_PLATE_RADIUS * CANOPY_PLATE_SCALE[0] * baseScale,
          CANOPY_PLATE_RADIUS * CANOPY_PLATE_SCALE[1] * baseScale,
          CANOPY_PLATE_RADIUS * CANOPY_PLATE_SCALE[2] * baseScale,
        );
        const centerY = groundHeight + getCanopyYOffset(entry) * baseScale;

        this.canopies.push({
          center: new Vector3(entry.position[0], centerY, entry.position[2]),
          halfExtents,
          rotationY: entry.rotation,
        });

        const topHalfExtents = new Vector3(
          TOP_CANOPY_RADIUS * TOP_CANOPY_SCALE[0] * baseScale,
          TOP_CANOPY_RADIUS * TOP_CANOPY_SCALE[1] * baseScale,
          TOP_CANOPY_RADIUS * TOP_CANOPY_SCALE[2] * baseScale,
        );
        const topCenterY = groundHeight + TOP_CANOPY_Y_OFFSET * baseScale;

        this.topCanopies.push({
          center: new Vector3(entry.position[0], topCenterY, entry.position[2]),
          halfExtents: topHalfExtents,
          rotationY: entry.rotation,
        });

        const trunkRadius = TRUNK_COLLIDER_RADIUS * TRUNK_COLLIDER_RADIAL_SCALE * baseScale;
        const trunkHeight = TRUNK_COLLIDER_HEIGHT * baseScale;
        this.trunks.push({
          center: new Vector3(entry.position[0], 0, entry.position[2]),
          radius: trunkRadius,
          bottomY: groundHeight,
          topY: groundHeight + trunkHeight,
        });
      }

      this.logger.log(
        `Loaded ${this.canopies.length} canopy, ${this.topCanopies.length} top-canopy, and ${this.trunks.length} trunk obstacles for occlusion from ${loadedFrom}`,
      );
    } catch (err) {
      // Non-fatal: worst case, canopies don't block shots/sightlines yet —
      // the rest of the server has no other dependency on this data.
      this.logger.warn(`Could not load canopy obstacles from POS.json: ${(err as Error).message}`);
    }
  }

  /** Ray vs a single canopy ellipsoid, accounting for its Y rotation. */
  private isRayOccludedByCanopy(
    rayOrigin: Vector3,
    rayDirection: Vector3,
    distance: number,
    canopy: CanopyObstacle,
  ): boolean {
    // Transform into the canopy's local (unrotated, centered) frame.
    const cos = Math.cos(-canopy.rotationY);
    const sin = Math.sin(-canopy.rotationY);

    const rel = rayOrigin.clone().sub(canopy.center);
    const localOrigin = new Vector3(rel.x * cos + rel.z * sin, rel.y, -rel.x * sin + rel.z * cos);
    const localDir = new Vector3(
      rayDirection.x * cos + rayDirection.z * sin,
      rayDirection.y,
      -rayDirection.x * sin + rayDirection.z * cos,
    );

    // Scale space so the ellipsoid becomes a unit sphere, then solve the
    // standard ray-sphere quadratic.
    const ox = localOrigin.x / canopy.halfExtents.x;
    const oy = localOrigin.y / canopy.halfExtents.y;
    const oz = localOrigin.z / canopy.halfExtents.z;
    const dx = localDir.x / canopy.halfExtents.x;
    const dy = localDir.y / canopy.halfExtents.y;
    const dz = localDir.z / canopy.halfExtents.z;

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

  /** Ray vs a single trunk, modeled as a vertical (Y-axis) cylinder. */
  private isRayOccludedByTrunk(
    rayOrigin: Vector3,
    rayDirection: Vector3,
    distance: number,
    trunk: TrunkObstacle,
  ): boolean {
    // Solve the ray-vs-infinite-cylinder quadratic in the XZ plane, then
    // clip the resulting entry distance to both the cylinder's Y extent and
    // the [0, distance] segment actually being tested.
    const ox = rayOrigin.x - trunk.center.x;
    const oz = rayOrigin.z - trunk.center.z;
    const dx = rayDirection.x;
    const dz = rayDirection.z;

    const a = dx * dx + dz * dz;
    const b = 2 * (ox * dx + oz * dz);
    const c = ox * ox + oz * oz - trunk.radius * trunk.radius;

    let tEntry: number;
    if (a === 0) {
      // Ray travels straight up/down; only possibly occluded if its XZ
      // origin already falls within the trunk's radius.
      if (c > 0) return false;
      tEntry = 0;
    } else {
      const discriminant = b * b - 4 * a * c;
      if (discriminant < 0) return false;

      const sqrtDisc = Math.sqrt(discriminant);
      const t0 = (-b - sqrtDisc) / (2 * a);
      const t1 = (-b + sqrtDisc) / (2 * a);
      tEntry = Math.max(0, Math.min(t0, t1));
    }

    if (tEntry >= distance) return false;

    const entryY = rayOrigin.y + rayDirection.y * tEntry;
    return entryY >= trunk.bottomY && entryY <= trunk.topY;
  }

  /**
   * Cheap bounding-sphere reject (XZ distance from ray origin to canopy
   * center, vs. the shot's own range plus the canopy's own reach) used to
   * skip the full rotated-ellipsoid math below for trees nowhere near this
   * particular shot. Added specifically for the top canopy: doubling the
   * number of canopy obstacles to occlude against (bottom plate + crown, one
   * pair per tree, thousands of trees) would double the per-shot cost
   * otherwise — this keeps the top-canopy check limited to trees actually
   * near the shot instead of testing every tree on the map.
   */
  private isCanopyNearRay(rayOrigin: Vector3, distance: number, canopy: CanopyObstacle): boolean {
    const maxReach = Math.max(canopy.halfExtents.x, canopy.halfExtents.z);
    const dx = canopy.center.x - rayOrigin.x;
    const dz = canopy.center.z - rayOrigin.z;
    return Math.sqrt(dx * dx + dz * dz) <= distance + maxReach;
  }

  /**
   * True if terrain, a canopy, OR a trunk blocks the straight line from
   * `rayOrigin` to a point `distance` away along `rayDirection`. The single
   * check callers (shot resolution, bot line-of-sight) should use instead of
   * terrain-only occlusion, now that the bottom canopy and the trunk are
   * both real cover — the trunk already blocks player movement (see
   * TreeColliders in Tree.tsx), so shots need to respect the same shape.
   *
   * No bot ground-pathing equivalent (there was one for rocks —
   * steerAroundRocks — before rocks were replaced by canopy collision):
   * canopies sit ~25x a tree's scale above the ground, so a ray between two
   * grounded bots essentially never crosses one. It only matters for shots
   * between elevated positions (e.g. players using a canopy as a platform),
   * which occlusion alone already covers. Trunks, unlike canopies, do sit at
   * ground level, but bot pathing already steers around them via the
   * client-mirrored trunk collider elsewhere, so this only needs to add the
   * sightline/shot check.
   */
  isPathOccluded(rayOrigin: Vector3, rayDirection: Vector3, distance: number): boolean {
    if (this.isRayOccludedByTerrain(rayOrigin, rayDirection, distance)) return true;

    for (const canopy of this.canopies) {
      if (this.isRayOccludedByCanopy(rayOrigin, rayDirection, distance, canopy)) return true;
    }

    for (const topCanopy of this.topCanopies) {
      if (!this.isCanopyNearRay(rayOrigin, distance, topCanopy)) continue;
      if (this.isRayOccludedByCanopy(rayOrigin, rayDirection, distance, topCanopy)) return true;
    }

    for (const trunk of this.trunks) {
      if (this.isRayOccludedByTrunk(rayOrigin, rayDirection, distance, trunk)) return true;
    }

    return false;
  }

  // ── Bot obstacle avoidance ───────────────────────────────────────────────────

  /**
   * Pushes a ground-level point out of any trunk or canopy it's currently
   * inside, in the XZ plane. Real players get this for free from
   * TreeColliders' contact resolution in TPP.tsx (collectContacts +
   * sphereVsCylinder/sphereVsEllipsoid) — bots move server-side with no
   * client collider, so movement here has to run the same shape math or bots
   * just walk straight through trunks and end up phased inside canopies on
   * terrain tall enough to reach the low canopy plate. Only resolves XZ:
   * callers always re-snap Y from terrain height right after, so a Y push
   * here would just be discarded.
   */
  resolveGroundObstacles(position: Vector3, radius: number): Vector3 {
    const resolved = position.clone();

    for (const trunk of this.trunks) {
      const dx = resolved.x - trunk.center.x;
      const dz = resolved.z - trunk.center.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const minDist = trunk.radius + radius;
      if (dist >= minDist) continue;

      const nx = dist > 0 ? dx / dist : 1;
      const nz = dist > 0 ? dz / dist : 0;
      resolved.x = trunk.center.x + nx * minDist;
      resolved.z = trunk.center.z + nz * minDist;
    }

    for (const canopy of this.canopies) {
      // Canopy sits ~25x scale above the ground, so it only matters for bots
      // on terrain tall enough to actually reach its vertical span — cheap
      // to skip everyone else before doing the rotated-frame math below.
      if (Math.abs(resolved.y - canopy.center.y) >= canopy.halfExtents.y + radius) continue;

      const cos = Math.cos(-canopy.rotationY);
      const sin = Math.sin(-canopy.rotationY);
      const relX = resolved.x - canopy.center.x;
      const relZ = resolved.z - canopy.center.z;
      const localX = relX * cos + relZ * sin;
      const localZ = -relX * sin + relZ * cos;

      const rx = canopy.halfExtents.x + radius;
      const rz = canopy.halfExtents.z + radius;
      const norm = (localX * localX) / (rx * rx) + (localZ * localZ) / (rz * rz);
      if (norm >= 1 || norm === 0) continue;

      const scale = 1 / Math.sqrt(norm);
      const pushedLocalX = localX * scale;
      const pushedLocalZ = localZ * scale;

      resolved.x = canopy.center.x + pushedLocalX * cos + pushedLocalZ * sin;
      resolved.z = canopy.center.z - pushedLocalX * sin + pushedLocalZ * cos;
    }

    return resolved;
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