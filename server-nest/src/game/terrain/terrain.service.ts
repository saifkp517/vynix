import { Injectable } from '@nestjs/common';
import { createNoise2D } from 'simplex-noise';

// Must stay byte-for-byte identical to client/components/game-components/ground/Ground.tsx
// (same seed, same frequencies/amplitudes) — otherwise server and client terrain diverge.
const SEED = 12345;

const PRIMARY_FREQUENCY = 0.005;
const SECONDARY_FREQUENCY = 0.01;
const BASE_AMPLITUDE = 25;
const DETAIL_AMPLITUDE = 3;

// Highest the terrain can ever get (both noise layers at their peak). Lets
// callers skip terrain checks entirely when they can prove a ray never
// dips low enough to possibly hit ground.
export const MAX_TERRAIN_HEIGHT = BASE_AMPLITUDE + DETAIL_AMPLITUDE;

@Injectable()
export class TerrainService {
  private readonly noise2D = createNoise2D(() => SEED);
  // Terrain is static, so heights can be cached forever once computed. Keyed
  // on 1-unit-rounded coordinates — terrain varies slowly (PRIMARY_FREQUENCY
  // = 0.005) so rounding is visually/physically negligible but turns repeated
  // lookups (raycast walks, per-tick bot position) into cache hits.
  private readonly heightCache = new Map<string, number>();

  getHeight(x: number, z: number): number {
    const key = `${Math.round(x)}_${Math.round(z)}`;
    const cached = this.heightCache.get(key);
    if (cached !== undefined) return cached;

    const baseHeight = this.noise2D(x * PRIMARY_FREQUENCY, z * PRIMARY_FREQUENCY) * BASE_AMPLITUDE;
    const detail =
      this.noise2D(x * SECONDARY_FREQUENCY * 3.7, z * SECONDARY_FREQUENCY * 2.3) * DETAIL_AMPLITUDE;

    const height = baseHeight + detail;
    this.heightCache.set(key, height);
    return height;
  }
}
