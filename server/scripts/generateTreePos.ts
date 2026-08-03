import { writeFileSync } from 'fs';
import { join } from 'path';
import { TerrainService } from '../src/game/terrain/terrain.service';

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
}

const terrain = new TerrainService();

// Every ROCK_INTERVAL-th tree slot becomes a rock instead, so rock density is
// derived from tree density rather than an independent knob — keeps the
// "1 rock per 10 trees" ratio stable no matter what densityFactor is set to.
const ROCK_INTERVAL = 2;
// Rocks are big wide cover objects — cramming two together would just look
// like one blob and give overlapping/broken collision geometry. If a rock
// slot lands too close to an already-placed rock, it's demoted back to a
// tree instead of being skipped, so overall vegetation count stays unchanged.
// A rock's widest side is ~58 units, so this is set just past touching: it's
// what actually caps the final rock count, since at ROCK_INTERVAL=2 there are
// far more candidates than can physically fit without overlapping.
const ROCK_MIN_DISTANCE = 85;
// Trees shouldn't sprout inside a rock. The rock's largest half-extent is
// ~29 units, so this clears its footprint without carving out a big empty
// plaza around every single one.
const ROCK_TREE_CLEARANCE = 38;

const distance2D = (ax: number, az: number, bx: number, bz: number) =>
  Math.sqrt((ax - bx) ** 2 + (az - bz) ** 2);

const generateVegetation = (): Vegetation[] => {
  const radius = 800;
  const densityFactor = 0.002; // tree density knob — trees per unit area
  const center = [0, 0, 0];
  const treeCount = Math.floor(Math.PI * radius * radius * densityFactor);

  const seed = 12345;
  const random = mulberry32(seed);

  // Pass 1: lay out every point (position/rotation/scale) as a plain tree,
  // deciding rock candidacy up front. Deferring the tree-clearance cull to
  // pass 2 lets a rock clear out trees placed both before and after it in
  // generation order, not just earlier ones.
  const points: Vegetation[] = [];
  const rockCandidateIndices = new Set<number>();

  for (let i = 0; i < treeCount; i++) {
    const angle = random() * Math.PI * 2;
    const dist = Math.sqrt(random()) * radius;

    const x = center[0] + Math.cos(angle) * dist;
    const z = center[2] + Math.sin(angle) * dist;
    const y = terrain.getHeight(x, z) + 1.5;

    if ((i + 1) % ROCK_INTERVAL === 0) rockCandidateIndices.add(i);

    points.push({
      type: 'tree',
      position: [x, y, z],
      // Rocks use rotation to orient their entrance gap, same field trees
      // use for canopy variation — no extra schema needed.
      rotation: random() * Math.PI * 2,
      scale: 0.8 + random() * 0.4,
    });
  }

  // Pass 2: confirm rock candidates against ROCK_MIN_DISTANCE (demoting back
  // to tree if too close to an already-confirmed rock), then clear out any
  // tree within ROCK_TREE_CLEARANCE of each confirmed rock.
  const rockPositions: [number, number][] = [];
  const removedTreeIndices = new Set<number>();

  for (const i of rockCandidateIndices) {
    const [x, , z] = points[i].position;
    const farEnough = rockPositions.every(
      ([rx, rz]) => distance2D(x, z, rx, rz) >= ROCK_MIN_DISTANCE,
    );
    if (!farEnough) continue;

    points[i].type = 'rock';
    rockPositions.push([x, z]);

    for (let j = 0; j < points.length; j++) {
      if (j === i || points[j].type === 'rock') continue;
      const [tx, , tz] = points[j].position;
      if (distance2D(x, z, tx, tz) < ROCK_TREE_CLEARANCE) removedTreeIndices.add(j);
    }
  }

  return points.filter((_, i) => !removedTreeIndices.has(i));
};

const outputPath = join(__dirname, '../../client/public/POS.json');
writeFileSync(outputPath, JSON.stringify(generateVegetation(), null, 2));
console.log(`Wrote ${outputPath}`);
