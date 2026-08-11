import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, InstancedMesh, Object3D, Vector3 } from "three";

import { PLAYER_RADIUS } from "@/types/types";

const PARTICLE_COUNT = 48;
const GRAVITY = -9;
const DRAG = 0.5;
// how hard each particle curves around the burst axis instead of flying straight
const SWIRL = 5;
const GROUND_Y = -PLAYER_RADIUS; // local space: group origin sits at body centre
const BOUNCE = 0.45;
const LIFETIME = 2.2; // seconds — must stay under RemoteOpponents' removal delay
const RED = new Color("#ff2d2d");

const dummy = new Object3D();
const swirlForce = new Vector3();

/** One-shot burst of tiny red spheres flung out in random directions, used as
 * the opponent death animation. Purely visual: it lives inside the dying
 * opponent's group and is unmounted with it. */
export const DeathExplosion = ({ radius = 1 }: { radius?: number }) => {
  const meshRef = useRef<InstancedMesh>(null);
  const elapsed = useRef(0);

  // fixed random burst directions, generated once per death
  const particles = useMemo(() => {
    // one shared, slightly randomised axis the whole burst curls around, so the
    // debris reads as a single swirling cloud rather than 48 unrelated arcs
    const axis = new Vector3(Math.random() - 0.5, 1, Math.random() - 0.5).normalize();

    return Array.from({ length: PARTICLE_COUNT }, () => {
      // uniform point on a sphere so the scatter has no directional bias
      const theta = Math.random() * Math.PI * 2;
      const z = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - z * z);
      const dir = new Vector3(r * Math.cos(theta), z, r * Math.sin(theta));
      const speed = 3 + Math.random() * 6;

      return {
        velocity: dir.clone().multiplyScalar(speed).addScaledVector(axis, 2 + Math.random() * 3),
        // start scattered inside the body volume rather than all from one point
        position: dir.clone().multiplyScalar(radius * Math.random() * 0.6),
        axis,
        // varying swirl strength (and a few reversed) keeps the cloud churning
        swirl: SWIRL * (0.4 + Math.random()) * (Math.random() < 0.25 ? -1 : 1),
        scale: 0.06 + Math.random() * 0.1,
      };
    });
  }, [radius]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    elapsed.current += delta;
    const life = Math.min(elapsed.current / LIFETIME, 1);
    // hold full size while it flies around, then dissolve over the last third
    const shrink = 1 - Math.max(0, (life - 0.65) / 0.35) ** 2;

    particles.forEach((p, i) => {
      // push each particle perpendicular to both the burst axis and its own
      // outward offset — a curl force, so it orbits the cloud on the way out
      swirlForce.copy(p.axis).cross(p.position);
      p.velocity.addScaledVector(swirlForce, p.swirl * delta);

      p.velocity.y += GRAVITY * delta;
      p.velocity.multiplyScalar(Math.max(0, 1 - DRAG * delta));
      p.position.addScaledVector(p.velocity, delta);

      // skip along the ground instead of sinking through it
      if (p.position.y < GROUND_Y) {
        p.position.y = GROUND_Y;
        p.velocity.y = Math.abs(p.velocity.y) * BOUNCE;
        p.velocity.x *= 0.8;
        p.velocity.z *= 0.8;
      }

      dummy.position.copy(p.position);
      dummy.scale.setScalar(p.scale * shrink);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = life < 1;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshStandardMaterial color={RED} emissive={RED} emissiveIntensity={1.2} toneMapped={false} />
    </instancedMesh>
  );
};

export default DeathExplosion;
