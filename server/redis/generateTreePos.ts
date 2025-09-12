import { createNoise2D } from 'simplex-noise';

const SEED = 12345; // SEED value generates a unique noise landscape, make sure that seed id is similar to client when generating positions.

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const getGroundHeight = (x: number, z: number): number => {

  const noise2D = createNoise2D(() => SEED);
  const primaryFrequency = 0.005; // Controls the scale of hills
  const secondaryFrequency = 0.01; // Controls smaller variations
  const amplitude = 25; // Height of hills
  const noiseAmplitude = 3; // Height of smaller variations

  // Primary terrain height using Simplex noise
  const baseHeight = noise2D(x * primaryFrequency, z * primaryFrequency) * amplitude;

  // Secondary noise for additional variation
  const noise = noise2D(x * secondaryFrequency * 3.7, z * secondaryFrequency * 2.3) * noiseAmplitude;

  return baseHeight + noise;
}

interface Vegetation {
    id?: string;
    type: string;
    position: [number, number, number];
    scale: number;
    rotation: number;
}

const generateTreePositions = () => {
  const radius = 1000;
  const densityFactor = 0.002;
  const center = [0, 0, 0];
  const treeCount = Math.floor(Math.PI * radius * radius * densityFactor);

  const seed = 12345;
  let random = mulberry32(seed);

  const vegetation: Vegetation[] = [];

  for (let i = 0; i < treeCount; i++) {
    const angle = random() * Math.PI * 2;
    const dist = Math.sqrt(random()) * radius;

    const x = center[0] + Math.cos(angle) * dist;
    const z = center[2] + Math.sin(angle) * dist;
    const y = getGroundHeight(x, z) + 1.5;

    vegetation.push({
      type: 'tree',
      position: [x, y, z],
      rotation: random() * Math.PI * 2,
      scale: 0.8 + random() * 0.4,
    });
  }

  return vegetation;
};

console.log(JSON.stringify(generateTreePositions(), null, 2));