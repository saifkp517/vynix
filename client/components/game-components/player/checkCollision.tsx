// systems/checkCollision.ts
//
// Depth-based collision detection against scene obstacles.
//
// The previous version returned only a *normal* for the *first* overlapping
// obstacle, and classified boxes using `Box3.setFromObject` — a world-space
// AABB. That broke down badly on rotated, non-uniformly-scaled colliders
// (the rock chunks):
//
//   * A rotated 26x14 box has an AABB footprint of ~28x28, so collision
//     fired well before the player visually touched the rock.
//   * The normal was snapped to a world axis (±X/±Y/±Z), pointing somewhere
//     unrelated to the surface actually being touched, so resolution shoved
//     the player sideways along a world axis instead of away from the face.
//   * With no penetration depth, the caller could never guarantee it had
//     separated the player from the surface — it could only restore the
//     previous position or apply a fixed nudge, both of which fail once the
//     player is already inside the volume.
//   * Returning a single contact meant a player touching two rock chunks at
//     once would be pushed out of one and into the other, forever.
//
// This version reports *every* overlapping obstacle with an exact
// world-space normal and penetration depth, so the caller can resolve all of
// them positionally and deterministically.

import { Vector3, Mesh, SphereGeometry, CylinderGeometry, Matrix4 } from "three";

export interface Contact {
  /** World-space unit normal, pointing from the obstacle surface toward the player. */
  normal: Vector3;
  /** How far the player has penetrated along `normal`. Always > 0. */
  depth: number;
  object: Mesh;
}

// Scratch vectors — collision runs every frame against every nearby obstacle,
// so this path allocates nothing per call.
const _center = new Vector3();
const _axisX = new Vector3();
const _axisY = new Vector3();
const _axisZ = new Vector3();
const _d = new Vector3();
const _closest = new Vector3();
const _delta = new Vector3();
const _radial = new Vector3();
const _sample = new Vector3();

/** Pulls the world-space center + basis vectors (with scale) out of a matrix. */
function decomposeBasis(m: Matrix4) {
  const e = m.elements;
  _axisX.set(e[0], e[1], e[2]);
  _axisY.set(e[4], e[5], e[6]);
  _axisZ.set(e[8], e[9], e[10]);
  _center.set(e[12], e[13], e[14]);
  const sx = _axisX.length();
  const sy = _axisY.length();
  const sz = _axisZ.length();
  if (sx > 0) _axisX.divideScalar(sx);
  if (sy > 0) _axisY.divideScalar(sy);
  if (sz > 0) _axisZ.divideScalar(sz);
  return { sx, sy, sz };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Sphere vs oriented box (OBB). Exact under arbitrary rotation and
 * non-uniform scale — the whole point of replacing the AABB path.
 */
function sphereVsBox(
  sphereCenter: Vector3,
  radius: number,
  obstacle: Mesh,
): { normal: Vector3; depth: number } | null {
  const params = (obstacle.geometry as any).parameters ?? {};
  const { sx, sy, sz } = decomposeBasis(obstacle.matrixWorld);

  const halfX = ((params.width ?? 1) / 2) * sx;
  const halfY = ((params.height ?? 1) / 2) * sy;
  const halfZ = ((params.depth ?? 1) / 2) * sz;

  _d.subVectors(sphereCenter, _center);
  const lx = _d.dot(_axisX);
  const ly = _d.dot(_axisY);
  const lz = _d.dot(_axisZ);

  const inside =
    Math.abs(lx) <= halfX && Math.abs(ly) <= halfY && Math.abs(lz) <= halfZ;

  if (!inside) {
    const cx = clamp(lx, -halfX, halfX);
    const cy = clamp(ly, -halfY, halfY);
    const cz = clamp(lz, -halfZ, halfZ);

    _closest
      .copy(_center)
      .addScaledVector(_axisX, cx)
      .addScaledVector(_axisY, cy)
      .addScaledVector(_axisZ, cz);

    _delta.subVectors(sphereCenter, _closest);
    const dist = _delta.length();
    if (dist >= radius || dist === 0) return null;

    return { normal: _delta.divideScalar(dist).clone(), depth: radius - dist };
  }

  // Center is inside the box — closest-point is degenerate, so push out along
  // whichever face is nearest. This is the recovery path for a player who has
  // already sunk into the volume (which is exactly how the old resolver left
  // them trapped inside a rock).
  const penX = halfX - Math.abs(lx);
  const penY = halfY - Math.abs(ly);
  const penZ = halfZ - Math.abs(lz);

  let normal: Vector3;
  let pen: number;
  if (penX <= penY && penX <= penZ) {
    normal = _axisX.clone().multiplyScalar(Math.sign(lx) || 1);
    pen = penX;
  } else if (penY <= penZ) {
    normal = _axisY.clone().multiplyScalar(Math.sign(ly) || 1);
    pen = penY;
  } else {
    normal = _axisZ.clone().multiplyScalar(Math.sign(lz) || 1);
    pen = penZ;
  }

  return { normal, depth: pen + radius };
}

/** Sphere vs (possibly scaled/rotated) cylinder — tree trunks. */
function sphereVsCylinder(
  sphereCenter: Vector3,
  radius: number,
  obstacle: Mesh,
): { normal: Vector3; depth: number } | null {
  const params = (obstacle.geometry as any).parameters ?? {};
  const { sx, sy, sz } = decomposeBasis(obstacle.matrixWorld);

  const radiusTop = params.radiusTop ?? 1;
  const radiusBottom = params.radiusBottom ?? radiusTop;
  const cylRadius = Math.max(radiusTop, radiusBottom) * Math.max(sx, sz);
  const halfH = ((params.height ?? 1) / 2) * sy;

  _d.subVectors(sphereCenter, _center);
  const along = _d.dot(_axisY);
  _radial.copy(_d).addScaledVector(_axisY, -along);
  const radialLen = _radial.length();

  const insideRadially = radialLen <= cylRadius;
  const insideAxially = Math.abs(along) <= halfH;

  if (!(insideRadially && insideAxially)) {
    const clampedAlong = clamp(along, -halfH, halfH);
    _closest.copy(_center).addScaledVector(_axisY, clampedAlong);
    if (radialLen > 0) {
      _closest.addScaledVector(_radial, Math.min(radialLen, cylRadius) / radialLen);
    }

    _delta.subVectors(sphereCenter, _closest);
    const dist = _delta.length();
    if (dist >= radius || dist === 0) return null;

    return { normal: _delta.divideScalar(dist).clone(), depth: radius - dist };
  }

  // Inside the cylinder — push out the short way (side wall vs nearest cap).
  const radialPen = cylRadius - radialLen;
  const axialPen = halfH - Math.abs(along);

  if (axialPen <= radialPen) {
    return {
      normal: _axisY.clone().multiplyScalar(Math.sign(along) || 1),
      depth: axialPen + radius,
    };
  }

  const normal =
    radialLen > 0 ? _radial.clone().divideScalar(radialLen) : _axisX.clone();
  return { normal, depth: radialPen + radius };
}

/**
 * Sphere vs ellipsoid — rock bodies and canopy domes (non-uniformly scaled
 * spheres). Works in the ellipsoid's own rotated frame rather than reading
 * `position`/`scale` directly, so a rock with an oblong footprint collides
 * along the axes it's actually turned to (and so a parent group transform
 * can't silently offset it).
 */
function sphereVsEllipsoid(
  sphereCenter: Vector3,
  radius: number,
  obstacle: Mesh,
): { normal: Vector3; depth: number } | null {
  const baseRadius = (obstacle.geometry as any).parameters?.radius ?? 1;
  const { sx, sy, sz } = decomposeBasis(obstacle.matrixWorld);

  const rx = baseRadius * sx + radius;
  const ry = baseRadius * sy + radius;
  const rz = baseRadius * sz + radius;

  _d.subVectors(sphereCenter, _center);
  const lx = _d.dot(_axisX);
  const ly = _d.dot(_axisY);
  const lz = _d.dot(_axisZ);

  const norm =
    (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) + (lz * lz) / (rz * rz);
  if (norm >= 1 || norm === 0) return null;

  // Gradient of the ellipsoid field gives the true surface normal, mapped
  // back out of the local frame into world space.
  const normal = new Vector3()
    .addScaledVector(_axisX, lx / (rx * rx))
    .addScaledVector(_axisY, ly / (ry * ry))
    .addScaledVector(_axisZ, lz / (rz * rz));
  const nLen = normal.length();
  if (nLen === 0) return null;
  normal.divideScalar(nLen);

  // Approximate depth: distance from the player to the ellipsoid surface
  // along the ray from its center. Exact depth on an ellipsoid has no closed
  // form worth the cost here, and this is accurate near the surface — which
  // is where resolution actually happens.
  const dLen = _d.length();
  if (dLen === 0) return null;
  const surfaceDist = dLen / Math.sqrt(norm);
  return { normal, depth: Math.max(0, surfaceDist - dLen) };
}

/**
 * Exact top-surface height of an ellipsoid obstacle at a given (x, z), or
 * `null` if that point falls outside its horizontal footprint.
 *
 * Standing/walking on a dome was previously placed by the same depth-based
 * push used for wall contacts: separate along the contact normal by the
 * penetration depth. That's correct for not-interpenetrating, but it's not
 * the same thing as smooth — the correction direction tilts with the dome's
 * slope, sample-to-sample penetration depth isn't continuous frame to frame
 * (3 fixed capsule samples, not a continuous surface probe), and standing
 * still still gets gravity pulling in every frame followed by a fresh
 * push-out, which reads as roughness against ground movement (a single
 * continuous analytic height function, computed exactly like this). Calling
 * this once contacts confirm the player is actually resting on a specific
 * dome (see TPP.tsx) gives that same continuous, exact placement instead.
 */
export function ellipsoidTopHeightAt(x: number, z: number, obstacle: Mesh): number | null {
  const baseRadius = (obstacle.geometry as any).parameters?.radius ?? 1;
  const { sx, sy, sz } = decomposeBasis(obstacle.matrixWorld);

  const rx = baseRadius * sx;
  const ry = baseRadius * sy;
  const rz = baseRadius * sz;
  if (rx === 0 || rz === 0) return null;

  // _axisX/_axisZ are horizontal-only for every obstacle in this game (only
  // ever Y-rotated), so projecting a bare (x, z) query point onto them —
  // with no y component to dot against — is exact, not an approximation.
  const dx = x - _center.x;
  const dz = z - _center.z;
  const lx = dx * _axisX.x + dz * _axisX.z;
  const lz = dx * _axisZ.x + dz * _axisZ.z;

  const norm = (lx * lx) / (rx * rx) + (lz * lz) / (rz * rz);
  if (norm > 1) return null;

  return _center.y + ry * Math.sqrt(Math.max(0, 1 - norm));
}

/**
 * Returns every obstacle currently overlapping the player's capsule, with an
 * exact world-space normal and penetration depth for each.
 *
 * The player is approximated by spheres sampled along its vertical axis
 * (feet / center / head) rather than a single center sphere, so tall
 * obstacles can't slip between samples and clip through the body. Only the
 * deepest contact per obstacle is reported — one obstacle should never push
 * the player more than once in a frame.
 *
 * @param playerCenter Center of the player capsule.
 * @param halfHeight   Half the capsule's total height (feet at center.y - halfHeight).
 */
export function collectContacts(
  playerCenter: Vector3,
  obstacles: (Mesh | null)[],
  radius: number,
  halfHeight: number,
): Contact[] {
  const contacts: Contact[] = [];

  // Sample sphere centers inset by `radius` so the capsule's extremes land
  // exactly on the feet and the top of the head.
  const inset = Math.max(0, halfHeight - radius);
  const offsets = [-inset, 0, inset];

  for (const obstacle of obstacles) {
    if (!obstacle) continue;

    const geometry = obstacle.geometry;
    const isSphere = geometry instanceof SphereGeometry;
    const isCylinder = geometry instanceof CylinderGeometry;

    let best: { normal: Vector3; depth: number } | null = null;

    for (const offset of offsets) {
      _sample.set(playerCenter.x, playerCenter.y + offset, playerCenter.z);

      const hit = isSphere
        ? sphereVsEllipsoid(_sample, radius, obstacle)
        : isCylinder
          ? sphereVsCylinder(_sample, radius, obstacle)
          : sphereVsBox(_sample, radius, obstacle);

      if (hit && hit.depth > 0 && (!best || hit.depth > best.depth)) best = hit;
    }

    if (best) contacts.push({ normal: best.normal, depth: best.depth, object: obstacle });
  }

  // Deepest first — resolving the worst overlap before shallower ones
  // converges faster and avoids a deep contact being undone by a grazing one.
  contacts.sort((a, b) => b.depth - a.depth);
  return contacts;
}
