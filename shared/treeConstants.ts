// Single source of truth for tree collider/occlusion geometry, imported by
// both client/components/game-components/obstacles/Tree.tsx (visuals +
// movement colliders) and server/src/game/physics/physics.service.ts (shot
// and bot-sightline occlusion). Keeping this in one file means the two
// sides can't drift the way the CANOPY_PLATE_* constants used to before
// this file existed.

// Canopy plate: the wide flat bottom-canopy layer that acts as real cover.
// Radius/scale describe a SphereGeometry(1) scaled into a flat ellipsoid.
export const CANOPY_PLATE_RADIUS = 3.5;
export const CANOPY_PLATE_Y_OFFSET = 25.0;
export const CANOPY_PLATE_SCALE: [number, number, number] = [8.0, 1.6, 8.0];

// Trunk collider: a CylinderGeometry(radius, radius, height, 8) scaled by
// [baseScale * radialScale, baseScale, baseScale * radialScale].
export const TRUNK_COLLIDER_RADIUS = 1.5;
export const TRUNK_COLLIDER_HEIGHT = 48;
export const TRUNK_COLLIDER_RADIAL_SCALE = 0.8;

// Top canopy: the crown cluster sitting on top of the trunk. Used to be three
// independently wind-swayed, per-client-random spheres (large/medium/small)
// — fine while purely decorative, but that meant no two players' clients
// agreed on where the crown actually was, which is a problem the moment it's
// meant to be a solid, standable/shootable object like the bottom canopy
// plate. It's now one deterministic ellipsoid (same "flat sphere" treatment
// as CANOPY_PLATE_*), sized after the old largeCanopy layer since that was
// the dominant visual shape. Offset is relative to groundHeight and already
// includes the trunk's own height contribution (TRUNK_COLLIDER_HEIGHT / 2,
// i.e. the old `canopyLift`), so — like CANOPY_PLATE_Y_OFFSET — it can be
// added to groundHeight directly.
export const TOP_CANOPY_RADIUS = 2.8;
export const TOP_CANOPY_Y_OFFSET = TRUNK_COLLIDER_HEIGHT / 2 + 20.4;
export const TOP_CANOPY_SCALE: [number, number, number] = [6.0, 2.4, 6.0];
