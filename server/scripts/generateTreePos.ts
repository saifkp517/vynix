import { writeFileSync } from 'fs';
import { join } from 'path';
import { TerrainService } from '../src/game/terrain/terrain.service';
import { TOP_CANOPY_RADIUS, TOP_CANOPY_SCALE } from '../../shared/treeConstants';

// Tree placement RNG — independent of the terrain height function (which
// comes from TerrainService below). This seed only controls where trees are
// scattered and their rotation/scale; changing it (or the density knobs
// further down) never touches terrain height, so it can't desync physics.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

interface Vegetation {
  id?: string;
  type: string;
  position: [number, number, number];
  scale: number;
  rotation: number;
  canopyHeightOffset?: number;
}

const terrain = new TerrainService();

const distance2D = (ax: number, az: number, bx: number, bz: number) =>
  Math.sqrt((ax - bx) ** 2 + (az - bz) ** 2);

// Canopy horizontal radius is CANOPY_PLATE_RADIUS(3.5) * CANOPY_PLATE_SCALE_X(8)
// * baseScale(scale*1.2) — mirrors Tree.tsx/physics.service.ts — so with
// scale in [0.8, 1.2] a canopy's radius runs roughly 27-40 units.
const canopyRadiusOf = (scale: number) => 3.5 * 8.0 * (scale * 1.2);

// Same idea for the top canopy (the crown cluster above the trunk), now a
// solid collidable object too (see TOP_CANOPY_* in shared/treeConstants.ts)
// rather than purely decorative — so overlap between two crowns needs the
// same rejection treatment the bottom plate already gets, or dense clusters
// end up with several stacked, mutually-fighting crown colliders.
const topCanopyRadiusOf = (scale: number) => TOP_CANOPY_RADIUS * TOP_CANOPY_SCALE[0] * (scale * 1.2);

const generateVegetation = (): Vegetation[] => {
  const radius = 800;
  const densityFactor = 0.002; // tree density knob — trees per unit area
  const center = [0, 0, 0];
  const targetTreeCount = Math.floor(Math.PI * radius * radius * densityFactor);

  const seed = 12345;
  const random = mulberry32(seed);

  // Pure random scatter (no spacing constraint) could drop several trees
  // almost on top of each other — natural-looking, but their trunk+canopy
  // colliders combine into a maze that's miserable to navigate. Poisson-disc
  // -style rejection (redraw a point if it lands too close to an already-
  // placed tree) keeps the same organic randomness everywhere else while
  // guaranteeing a floor on trunk-to-trunk spacing.
  const MIN_TREE_DISTANCE = 25;

  // Every canopy now sits at the same fixed height (CANOPY_PLATE_Y_OFFSET,
  // no per-tree offset) — that used to vary per tree via a height-tiering
  // scheme meant to keep nearby canopies from overlapping and "fighting"
  // over the player. Problems with that: tiers were centered on 0 and spread
  // ±56 units to give crowded clusters enough separation, which routinely
  // pushed low tiers to a net offset well below the ground (submerged
  // canopies), and made otherwise-identical trees sit at wildly different
  // heights (the mismatched, "irregular" look). A uniform height fixes both.
  // The overlap problem this was solving is handled here instead, at
  // placement time: candidates are rejected not just for being too close in
  // trunk-to-trunk distance, but for having canopies that would overlap too
  // much. Some overlap at the edges is still allowed/expected (that's the
  // "canopy ceiling" look trees are meant to blend into) — CANOPY_OVERLAP_
  // ALLOWANCE controls how much of two canopies' combined radius may overlap
  // before a placement is rejected, so canopies stay consistent in height
  // while dense clusters are thinned out horizontally instead of stacked
  // vertically.
  const CANOPY_OVERLAP_ALLOWANCE = 0.35;

  // Rejection sampling gets less efficient as the area fills up; this caps
  // total draws so generation always terminates. At MIN_TREE_DISTANCE=25 the
  // area can't actually pack targetTreeCount trees at max density anyway
  // (circle-packing math), so the final count comes in somewhat under
  // target — that's the deliberate tradeoff for guaranteed spacing.
  const MAX_ATTEMPTS = targetTreeCount * 40;

  // Canopies (~27-40 unit radius) reach far past trunk-to-trunk spacing
  // (25), so the spatial grid used to check for conflicts has to be sized
  // for canopy reach, not trunk distance, or neighboring cells holding
  // overlapping canopies would be missed entirely.
  const MAX_CANOPY_RADIUS = canopyRadiusOf(1.2);
  const cellSize = MAX_CANOPY_RADIUS * 2;
  const grid = new Map<string, number[]>(); // cellKey -> indices into vegetation
  const cellKey = (x: number, z: number) => `${Math.floor(x / cellSize)}_${Math.floor(z / cellSize)}`;

  const vegetation: Vegetation[] = [];

  const conflictsWithExisting = (x: number, z: number, canopyRadius: number, topCanopyRadius: number): boolean => {
    const cx = Math.floor(x / cellSize);
    const cz = Math.floor(z / cellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cell = grid.get(`${cx + dx}_${cz + dz}`);
        if (!cell) continue;
        for (const index of cell) {
          const [ex, , ez] = vegetation[index].position;
          const dist = distance2D(x, z, ex, ez);

          if (dist < MIN_TREE_DISTANCE) return true;

          const combinedCanopyRadius = canopyRadius + canopyRadiusOf(vegetation[index].scale);
          const maxAllowedOverlap = combinedCanopyRadius * CANOPY_OVERLAP_ALLOWANCE;
          if (dist < combinedCanopyRadius - maxAllowedOverlap) return true;

          const combinedTopCanopyRadius = topCanopyRadius + topCanopyRadiusOf(vegetation[index].scale);
          const maxAllowedTopOverlap = combinedTopCanopyRadius * CANOPY_OVERLAP_ALLOWANCE;
          if (dist < combinedTopCanopyRadius - maxAllowedTopOverlap) return true;
        }
      }
    }
    return false;
  };

  let attempts = 0;

  while (vegetation.length < targetTreeCount && attempts < MAX_ATTEMPTS) {
    attempts++;

    const angle = random() * Math.PI * 2;
    const dist = Math.sqrt(random()) * radius;
    const x = center[0] + Math.cos(angle) * dist;
    const z = center[2] + Math.sin(angle) * dist;
    const scale = 0.8 + random() * 0.4;

    if (conflictsWithExisting(x, z, canopyRadiusOf(scale), topCanopyRadiusOf(scale))) continue;

    const y = terrain.getHeight(x, z) + 1.5;
    const index = vegetation.length;
    vegetation.push({
      type: 'tree',
      position: [x, y, z],
      rotation: random() * Math.PI * 2,
      scale,
    });

    const key = cellKey(x, z);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(index);
  }

  return vegetation;
};

const outputPath = join(__dirname, '../../client/public/POS.json');
writeFileSync(outputPath, JSON.stringify(generateVegetation(), null, 2));
console.log(`Wrote ${outputPath}`);
