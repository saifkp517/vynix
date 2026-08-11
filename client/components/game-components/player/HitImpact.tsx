import { RefObject, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import socket from '@/lib/socket';
import { PLAYER_RADIUS, PLAYER_HITBOX_Y_OFFSET } from '@/types/types';

interface Props {
  playerCenterRef: RefObject<THREE.Vector3>;
}

const MAX_IMPACT_INSTANCES = 24;
const PARTICLES_PER_HIT = 6;
const IMPACT_DURATION = 650; // ms
const IMPACT_SPEED = 3.5; // units per second — slower than before since the burst now lingers roughly 2x longer

interface ImpactParticle {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  createdAt: number;
}

// Driven directly off the same 'hit' event that triggers the screen flash
// in GameInfo, so the burst can never desync from it (a separate
// proximity-guess in the tracer code used to miss during movement).
const HitImpact: React.FC<Props> = ({ playerCenterRef }) => {
  const { scene } = useThree();
  const instancedImpacts = useRef<THREE.InstancedMesh | null>(null);
  const impactData = useRef<ImpactParticle[]>([]);

  useEffect(() => {
    const geometry = new THREE.SphereGeometry(0.4, 8, 8);
    const material = new THREE.MeshStandardMaterial({
      color: '#ff8800',
      emissive: '#ff4400',
      emissiveIntensity: 2.5,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, MAX_IMPACT_INSTANCES);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;

    const matrix = new THREE.Matrix4();
    for (let i = 0; i < MAX_IMPACT_INSTANCES; i++) {
      matrix.makeScale(0, 0, 0);
      mesh.setMatrixAt(i, matrix);
      impactData.current.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        createdAt: 0,
      });
    }
    mesh.instanceMatrix.needsUpdate = true;

    instancedImpacts.current = mesh;
    scene.add(mesh);

    return () => {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    };
  }, [scene]);

  useEffect(() => {
    const handleHit = ({ rayOrigin }: { rayOrigin: { x: number; y: number; z: number } }) => {
      const localPos = playerCenterRef.current;
      if (!localPos || !instancedImpacts.current) return;

      const hitboxCenter = new THREE.Vector3(localPos.x, localPos.y - PLAYER_HITBOX_Y_OFFSET, localPos.z);
      const origin = new THREE.Vector3(rayOrigin.x, rayOrigin.y, rayOrigin.z);

      // the bullet hits the side of the hitbox facing the shooter
      const dirToShooter = origin.clone().sub(hitboxCenter);
      if (dirToShooter.lengthSq() < 1e-6) dirToShooter.set(0, 0, 1);
      dirToShooter.normalize();

      const impactPoint = hitboxCenter.clone().addScaledVector(dirToShooter, PLAYER_RADIUS);

      for (let i = 0; i < PARTICLES_PER_HIT; i++) {
        const freeIndex = impactData.current.findIndex((data) => !data.active);
        if (freeIndex === -1) break;

        const data = impactData.current[freeIndex];
        data.active = true;
        data.position.copy(impactPoint);

        const scatter = dirToShooter.clone().multiplyScalar(0.25).add(
          new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5,
          ).multiplyScalar(0.75),
        ).normalize();

        data.velocity.copy(scatter).multiplyScalar(IMPACT_SPEED * (0.6 + Math.random() * 0.8));
        data.createdAt = Date.now();
      }
    };

    socket.on('hit', handleHit);
    return () => {
      socket.off('hit', handleHit);
    };
  }, [playerCenterRef]);

  useFrame((_, delta) => {
    if (!instancedImpacts.current) return;

    const now = Date.now();
    let needsUpdate = false;
    const matrix = new THREE.Matrix4();

    impactData.current.forEach((data, index) => {
      if (!data.active) return;

      const age = now - data.createdAt;
      if (age > IMPACT_DURATION) {
        data.active = false;
        matrix.makeScale(0, 0, 0);
      } else {
        data.position.addScaledVector(data.velocity, delta);
        const shrink = 1 - age / IMPACT_DURATION;
        matrix.compose(data.position, new THREE.Quaternion(), new THREE.Vector3(shrink, shrink, shrink));
      }

      instancedImpacts.current?.setMatrixAt(index, matrix);
      needsUpdate = true;
    });

    if (needsUpdate) {
      instancedImpacts.current.instanceMatrix.needsUpdate = true;
    }
  });

  return null;
};

export default HitImpact;
