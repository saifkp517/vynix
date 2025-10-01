import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { EventEmitter } from 'events';
import { useFrame, useThree } from '@react-three/fiber';

interface OpponentGunProps {
  cameraDirection: () => THREE.Vector3 | null; // Direction the opponent's camera is facing
  shootEvent: EventEmitter; // Event emitter for playerShot events
  userId: string; // Opponent's user ID
}

const OpponentGun: React.FC<OpponentGunProps> = ({ cameraDirection, shootEvent, userId }) => {
  const gunRef = useRef<THREE.Group>(null as unknown as THREE.Group);
  const scene = useThree().scene;
  const instancedTracers = useRef<THREE.InstancedMesh | null>(null);
  const instancedTrails = useRef<THREE.InstancedMesh | null>(null);
  const maxInstances = 100;
  const bulletSpeed = 150; // Units per second
  const maxTracerDistance = 100; // Maximum distance a tracer can travel
  const instanceData = useRef<Array<{
    active: boolean;
    position: THREE.Vector3;
    direction: THREE.Vector3;
    startPos: THREE.Vector3;
    createdAt: number;
  }>>([]);

  // Initialize instanced meshes for tracers and trails
  useEffect(() => {
    const bulletGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const bulletMaterial = new THREE.MeshStandardMaterial({
      color: '#ffff00',
      emissive: '#ffff00',
      emissiveIntensity: 0.8,
    });

    const instancedBulletMesh = new THREE.InstancedMesh(bulletGeometry, bulletMaterial, maxInstances);
    instancedBulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instancedBulletMesh.frustumCulled = false;

    const trailGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
    const trailMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.7,
      emissive: '#ffffff',
      emissiveIntensity: 0.3,
    });

    const instancedTrailMesh = new THREE.InstancedMesh(trailGeometry, trailMaterial, maxInstances);
    instancedTrailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instancedTrailMesh.frustumCulled = false;

    instancedTrailMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(maxInstances * 3),
      3
    );

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < maxInstances; i++) {
      matrix.makeScale(0, 0, 0);
      instancedBulletMesh.setMatrixAt(i, matrix);
      instancedTrailMesh.setMatrixAt(i, matrix);
      instancedTrailMesh.setColorAt(i, color.set(0, 0, 0));
      instanceData.current.push({
        active: false,
        position: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        startPos: new THREE.Vector3(),
        createdAt: 0,
      });
    }

    instancedBulletMesh.instanceMatrix.needsUpdate = true;
    instancedTrailMesh.instanceMatrix.needsUpdate = true;
    instancedTrailMesh.instanceColor!.needsUpdate = true;
    instancedTracers.current = instancedBulletMesh;
    instancedTrails.current = instancedTrailMesh;
    scene.add(instancedBulletMesh, instancedTrailMesh);

    return () => {
      scene.remove(instancedBulletMesh, instancedTrailMesh);
      bulletGeometry.dispose();
      bulletMaterial.dispose();
      trailGeometry.dispose();
      trailMaterial.dispose();
    };
  }, [scene]);

  // Create a bullet tracer based on the playerShot event payload
  const createBulletTracer = (rayOrigin: THREE.Vector3, rayDirection: THREE.Vector3) => {
    if (!instancedTracers.current || !instancedTrails.current) return;

    const availableIndex = instanceData.current.findIndex((data) => !data.active);
    if (availableIndex === -1) return;

    const data = instanceData.current[availableIndex];
    data.active = true;
    data.position.copy(rayOrigin);
    data.direction.copy(rayDirection).normalize();
    data.startPos.copy(rayOrigin);
    data.createdAt = Date.now();

    const bulletMatrix = new THREE.Matrix4();
    bulletMatrix.makeTranslation(rayOrigin.x, rayOrigin.y, rayOrigin.z);
    instancedTracers.current.setMatrixAt(availableIndex, bulletMatrix);

    const trailMatrix = new THREE.Matrix4();
    trailMatrix.makeTranslation(rayOrigin.x, rayOrigin.y, rayOrigin.z);
    instancedTrails.current.setMatrixAt(availableIndex, trailMatrix);
    instancedTrails.current.setColorAt(availableIndex, new THREE.Color(1, 1, 1));

    instancedTracers.current.instanceMatrix.needsUpdate = true;
    instancedTrails.current.instanceMatrix.needsUpdate = true;
    instancedTrails.current.instanceColor!.needsUpdate = true;
  };

  // Update gun orientation and tracer movement
  useFrame((state, delta) => {
    // Orient gun to match camera direction
    if (gunRef.current && cameraDirection) {
      const camDir = cameraDirection();
      if (camDir) {  // Only proceed if camDir is non-null
        const effectiveDir = camDir.clone().normalize().multiplyScalar(10);  // Normalize and scale consistently
        const worldPos = new THREE.Vector3();
        gunRef.current.getWorldPosition(worldPos);  // Get actual world position
        const targetDirection = worldPos.clone().add(effectiveDir);
        gunRef.current.lookAt(targetDirection);
      }
    }

    // Update tracer and trail positions
    if (!instancedTracers.current || !instancedTrails.current) return;

    const now = Date.now();
    let needsUpdate = false;
    const bulletMatrix = new THREE.Matrix4();
    const trailMatrix = new THREE.Matrix4();

    instanceData.current.forEach((data, index) => {
      if (!data.active) return;

      const movement = data.direction.clone().multiplyScalar(bulletSpeed * delta);
      data.position.add(movement);

      const distanceTraveled = data.position.distanceTo(data.startPos);
      const age = now - data.createdAt;

      if (distanceTraveled >= maxTracerDistance || age > 1000) {
        data.active = false;
        bulletMatrix.makeScale(0, 0, 0);
        trailMatrix.makeScale(0, 0, 0);
        instancedTrails.current?.setColorAt(index, new THREE.Color(0, 0, 0));
        needsUpdate = true;
      } else {
        bulletMatrix.makeTranslation(data.position.x, data.position.y, data.position.z);

        const trailLength = 5;
        const trailOffset = data.direction.clone().multiplyScalar(-trailLength * 0.5);
        const trailPosition = data.position.clone().add(trailOffset);
        trailMatrix.setPosition(trailPosition);

        const up = new THREE.Vector3(0, 1, 0);
        const direction = data.direction.clone();
        if (direction.lengthSq() > 0) {
          const quaternion = new THREE.Quaternion().setFromUnitVectors(
            up,
            direction.normalize()
          );
          trailMatrix.makeRotationFromQuaternion(quaternion);
          trailMatrix.scale(new THREE.Vector3(1, trailLength, 1));
          trailMatrix.setPosition(trailPosition);
        }

        const fade = 1 - age / 1000;
        instancedTrails.current?.setColorAt(
          index,
          new THREE.Color(1, 1, 1).multiplyScalar(fade)
        );
        needsUpdate = true;
      }

      instancedTracers.current?.setMatrixAt(index, bulletMatrix);
      instancedTrails.current?.setMatrixAt(index, trailMatrix);
    });

    if (needsUpdate) {
      instancedTracers.current.instanceMatrix.needsUpdate = true;
      instancedTrails.current.instanceMatrix.needsUpdate = true;
      if (instancedTrails.current.instanceColor) {
        instancedTrails.current.instanceColor.needsUpdate = true;
      }
    }
  });

  // Handle playerShot events
  useEffect(() => {
    const handleShoot = (payload: { id: string; rayOrigin: THREE.Vector3; rayDirection: THREE.Vector3 }) => {
      if (payload.id === userId) {
        createBulletTracer(payload.rayOrigin, payload.rayDirection);
      }
    };

    shootEvent.on('playerShot', handleShoot);

    return () => {
      shootEvent.removeListener('playerShot', handleShoot);
    };
  }, [shootEvent, userId]);

  return (
    <group ref={gunRef} position={[0.5, -0.3, -0.5]}>
      <mesh>
        <boxGeometry args={[0.4, 0.2, 1]} />
        <meshStandardMaterial color="gray" />
      </mesh>
      <mesh position={[0, 0, -0.7]}>
        <cylinderGeometry args={[0.05, 0.05, 0.5, 16]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[0, -0.2, -0.3]}>
        <boxGeometry args={[0.3, 0.3, 0.15]} />
        <meshStandardMaterial color="darkgray" />
      </mesh>
    </group>
  );
};

export default OpponentGun;