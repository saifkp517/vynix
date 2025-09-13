import React, { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { Howl } from 'howler';
import { useFrame, useThree } from '@react-three/fiber';
import { Raycaster, Vector3, Mesh, Group } from 'three';


import { useGameInfoStore } from '@/hooks/useGameInfoStore';
import { usePlayerInput } from '@/hooks/usePlayerInput';
import socket from '@/lib/socket';

import { PLAYER_RADIUS } from "@/types/types";

interface GunProps {
  roomId: string;
  camera: THREE.Camera;
  userId: string;
  obstacles: any;
  playerCenterRef: React.RefObject<THREE.Vector3>;
  getGroundHeight: (x: number, z: number) => number;
  otherPlayers: React.RefObject<Record<string, { position: THREE.Vector3 }>>;
  crosshairRef: React.RefObject<{ triggerHit: () => void }>;
}

const Gun: React.FC<GunProps> = ({
  roomId,
  camera,
  userId,
  obstacles,
  playerCenterRef,
  getGroundHeight,
  otherPlayers,
  crosshairRef,
}) => {
  const maxAmmo = 30;
  const gunRef = useRef<THREE.Group>(null!);
  const muzzleFlash = useRef(false);
  const isReloading = useRef(false);
  const scene = useThree().scene;

  const muzzleFlashTimeout = useRef<NodeJS.Timeout | null>(null);
  const barrelEndRef = useRef<Mesh>(null!);
  const isRecoiling = useRef(false);
  const recoilProgress = useRef(0);
  const bulletSpeed = 150; // units per second
  const maxTracerDistance = 100;

  const ammo = useGameInfoStore(state => state.ammo);
  const shoot = useGameInfoStore(state => state.shootBullet);
  const resetAmmo = useGameInfoStore(state => state.resetAmmo);

  const raycaster = useRef(new Raycaster());
  const mouse = useRef(new THREE.Vector2(0, 0)); // Center of the screen

  const instancedTracers = useRef<THREE.InstancedMesh | null>(null);
  const instancedTrails = useRef<THREE.InstancedMesh | null>(null);
  const maxInstances = 100;
  const instanceData = useRef<
    Array<{
      active: boolean;
      position: THREE.Vector3;
      direction: THREE.Vector3;
      startPos: THREE.Vector3;
      createdAt: number;
    }>
  >([]);

  // Impact particles system
  const impactParticles = useRef<THREE.InstancedMesh | null>(null);
  const maxParticles = 20; // Allow for multiple impacts
  const particleData = useRef<
    Array<{
      active: boolean;
      position: THREE.Vector3;
      velocity: THREE.Vector3;
      life: number;
      maxLife: number;
    }>
  >([]);



  //these vars are used to prevent infinite shoot loop
  const isTriggerHeld = useRef(false);
  const lastFireTime = useRef(0);
  const fireRateMs = 150;


  //get live barrel position
  const getBarrelWorldPos = () => {
    const v = new THREE.Vector3();
    if (barrelEndRef.current) {
      barrelEndRef.current.getWorldPosition(v);
      return v;
    }
    // fallback to camera position if barrel not ready
    return camera.position.clone();
  };

  // Initialize bullets, trails, and impact particles instanced meshes
  useEffect(() => {
    // Bullet tracer setup
    const bulletGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const bulletMaterial = new THREE.MeshStandardMaterial({
      color: '#ffff00',
      emissive: '#ffff00',
      emissiveIntensity: 0.8,
    });

    const instancedBulletMesh = new THREE.InstancedMesh(bulletGeometry, bulletMaterial, maxInstances);
    instancedBulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instancedBulletMesh.frustumCulled = false;

    // Trail setup
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

    // Impact particles setup
    const particleGeometry = new THREE.SphereGeometry(0.05, 6, 6);
    const particleMaterial = new THREE.MeshBasicMaterial({
      color: '#ffaa00',
      transparent: true,
      opacity: 1,
    });

    const instancedParticleMesh = new THREE.InstancedMesh(particleGeometry, particleMaterial, maxParticles);
    instancedParticleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instancedParticleMesh.frustumCulled = false;

    // Initialize all matrices and data
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

    for (let i = 0; i < maxParticles; i++) {
      matrix.makeScale(0, 0, 0);
      instancedParticleMesh.setMatrixAt(i, matrix);
      particleData.current.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
      });
    }

    instancedBulletMesh.instanceMatrix.needsUpdate = true;
    instancedTrailMesh.instanceMatrix.needsUpdate = true;
    instancedTrailMesh.instanceColor!.needsUpdate = true;
    instancedParticleMesh.instanceMatrix.needsUpdate = true;

    instancedTracers.current = instancedBulletMesh;
    instancedTrails.current = instancedTrailMesh;
    impactParticles.current = instancedParticleMesh;

    scene.add(instancedBulletMesh, instancedTrailMesh, instancedParticleMesh);

    return () => {
      scene.remove(instancedBulletMesh, instancedTrailMesh, instancedParticleMesh);
      bulletGeometry.dispose();
      bulletMaterial.dispose();
      trailGeometry.dispose();
      trailMaterial.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
    };
  }, [scene]);


  const createImpactParticles = (impactPoint: THREE.Vector3, normal: THREE.Vector3) => {
    if (!impactParticles.current) return;

    // Create exactly 2 particles
    for (let p = 0; p < 2; p++) {
      const availableIndex = particleData.current.findIndex(data => !data.active);
      if (availableIndex === -1) continue;

      const data = particleData.current[availableIndex];
      data.active = true;
      data.position.copy(impactPoint);
      data.life = 0;
      data.maxLife = 0.5 + Math.random() * 0.5; // 0.5-1 second life

      // Create random velocity in hemisphere based on surface normal
      const randomDirection = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random(), // Always up
        (Math.random() - 0.5) * 2
      ).normalize();

      // Blend with surface normal for more realistic bounce
      const velocity = normal.clone()
        .multiplyScalar(0.7)
        .add(randomDirection.multiplyScalar(0.3))
        .multiplyScalar(2 + Math.random() * 3); // Random speed 2-5 units/sec

      data.velocity.copy(velocity);

      // Set initial particle transform
      const matrix = new THREE.Matrix4();
      matrix.makeTranslation(impactPoint.x, impactPoint.y, impactPoint.z);
      matrix.scale(new THREE.Vector3(0.8 + Math.random() * 0.4, 0.8 + Math.random() * 0.4, 0.8 + Math.random() * 0.4));
      impactParticles.current.setMatrixAt(availableIndex, matrix);
    }

    impactParticles.current.instanceMatrix.needsUpdate = true;
  };

  const createBulletTracer = () => {
    if (!instancedTracers.current || !instancedTrails.current) return;

    const availableIndex = instanceData.current.findIndex(data => !data.active);
    if (availableIndex === -1) return;

    raycaster.current.setFromCamera(mouse.current, camera);

    let bulletDirection = camera.getWorldDirection(new THREE.Vector3()).normalize();
    const intersects = raycaster.current.intersectObjects(obstacles, false);

    const barrelWorldPos = getBarrelWorldPos();

    if (intersects.length > 0) {
      const point = intersects[0].point;
      bulletDirection = point.clone().sub(barrelWorldPos).normalize();
    }

    const data = instanceData.current[availableIndex];
    data.active = true;
    data.position.copy(barrelWorldPos);
    data.direction.copy(bulletDirection);
    data.startPos.copy(barrelWorldPos);
    data.createdAt = Date.now();

    const bulletMatrix = new THREE.Matrix4();
    bulletMatrix.makeTranslation(barrelWorldPos.x, barrelWorldPos.y, barrelWorldPos.z);
    instancedTracers.current.setMatrixAt(availableIndex, bulletMatrix);

    const trailMatrix = new THREE.Matrix4();
    trailMatrix.makeTranslation(barrelWorldPos.x, barrelWorldPos.y, barrelWorldPos.z);
    instancedTrails.current.setMatrixAt(availableIndex, trailMatrix);
    instancedTrails.current.setColorAt(availableIndex, new THREE.Color(1, 1, 1));

    instancedTracers.current.instanceMatrix.needsUpdate = true;
    instancedTrails.current.instanceMatrix.needsUpdate = true;
    instancedTrails.current.instanceColor!.needsUpdate = true;
  };

  // Integrate with usePlayerInput
  usePlayerInput({
    onJump: () => { },
    onSprintStart: () => { },
    onSprintEnd: () => { },
    onGrenade: () => { },
    onLeftMouseDown: () => { isTriggerHeld.current = true },
    onRightMouseDown: () => { },
    onLeftMouseUp: () => { isTriggerHeld.current = false },
    onRightMouseUp: () => { },
    setMoveState: () => { },
  });

  const shootBullet = () => {
    if (isReloading.current) return;

    // fresh ammo read
    const currentAmmo = useGameInfoStore.getState().ammo;
    if (currentAmmo <= 0) {
      reload();
      return;
    }

    // consume ammo first
    useGameInfoStore.getState().shootBullet();

    // perform raycast and effects ONCE
    const barrelWorldPos = getBarrelWorldPos();
    const shootDirection = new Vector3();
    camera.getWorldDirection(shootDirection).normalize();
    raycaster.current.set(camera.position, shootDirection);

    const intersects = raycaster.current.intersectObjects(obstacles, true);

    let shootObject = {
      // ensure these are plain Vector3 copies, not refs
      rayOrigin: barrelWorldPos.clone(),
      rayDirection: shootDirection.clone(),
      timestamp: Date.now(),
    };

    if (intersects.length > 0) {
      const firstHit = intersects[0];
      const hitPoint = firstHit.point;
      const hitNormal = firstHit.face?.normal || new Vector3(0, 1, 0);
      const worldNormal = hitNormal.clone().transformDirection(firstHit.object.matrixWorld);
      createImpactParticles(hitPoint, worldNormal);

      const hitDirection = new Vector3().subVectors(firstHit.point, playerCenterRef.current!).normalize();

      const groundY = getGroundHeight(hitPoint.x, hitPoint.z);
      const threshold = 0.1;
      if (hitPoint.y > groundY + threshold) {
        const players = Object.values(otherPlayers.current || {});
        players.forEach(player => {
          const playerPosition = player.position.clone().add(new Vector3(0, -1.5, 0));
          const { hit, distance } = rayIntersectsSphere(
            playerCenterRef.current!,
            hitDirection,
            playerPosition,
            PLAYER_RADIUS
          );
          if (hit) crosshairRef.current?.triggerHit();
        });
        shootObject = {
          rayOrigin: playerCenterRef.current!.clone(),
          rayDirection: hitDirection.clone(),
          timestamp: Date.now(),
        };
      }
    }

    socket.emit('shoot', { userId, shootObject, roomId });

    // visuals and sound
    if (gunRef.current) {
      gunRef.current.position.z = -0.7;
      setTimeout(() => {
        if (gunRef.current) gunRef.current.position.z = -0.6;
      }, 100);
    }

    // play the sound; ideally reuse a preloaded Howl to avoid per-shot allocations
    const gunShotSound = new Howl({ src: ['/sounds/gunshot.mp3'], volume: 0.5, rate: 2.0 });
    gunShotSound.play();

    muzzleFlash.current = true;
    if (muzzleFlashTimeout.current) clearTimeout(muzzleFlashTimeout.current);
    muzzleFlashTimeout.current = setTimeout(() => { muzzleFlash.current = false; }, 50);

    createBulletTracer();

    lastFireTime.current = performance.now();
  };


  const rayIntersectsSphere = (
    rayOrigin: Vector3,
    rayDirection: Vector3,
    sphereCenter: Vector3,
    sphereRadius: number
  ): { hit: boolean; distance: number } => {
    if (!rayOrigin || !rayDirection || !sphereCenter) {
      console.error('Invalid argument passed to rayIntersectsSphere:', {
        rayOrigin,
        rayDirection,
        sphereCenter,
      });
      return { hit: false, distance: Infinity };
    }

    const toCenter = new Vector3().subVectors(sphereCenter, rayOrigin);
    const projectionLength = toCenter.dot(rayDirection);

    if (projectionLength < 0) return { hit: false, distance: Infinity };
    const closestPoint = rayOrigin.clone().add(rayDirection.clone().multiplyScalar(projectionLength));
    const distanceToCenter = closestPoint.distanceTo(sphereCenter);

    const hit = distanceToCenter <= sphereRadius;
    return { hit, distance: distanceToCenter };
  };

  const reload = () => {
    if (isReloading.current || ammo === maxAmmo) return;

    const reloadSound = new Howl({
      src: ['/sounds/reload.mp3'],
      volume: 0.7,
    });
    reloadSound.play();

    isReloading.current = true;

    setTimeout(() => {
      isReloading.current = false;
      resetAmmo(maxAmmo);
    }, 2000);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'r' && !isReloading.current) {
        reload();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ammo, maxAmmo, resetAmmo]);

  useFrame((state, delta) => {
    if (gunRef.current && camera) {
      gunRef.current.lookAt(camera.position.clone());
    }

    if (!instancedTracers.current || !instancedTrails.current) return;

    const now = Date.now();
    let needsUpdate = false;
    const bulletMatrix = new THREE.Matrix4();
    const trailMatrix = new THREE.Matrix4();

    // Animate bullet tracers and trails
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
          const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction.normalize());
          trailMatrix.makeRotationFromQuaternion(quaternion);
          trailMatrix.scale(new THREE.Vector3(1, trailLength, 1));
          trailMatrix.setPosition(trailPosition);
        }

        const fade = 1 - age / 1000;
        instancedTrails.current?.setColorAt(index, new THREE.Color(1, 1, 1).multiplyScalar(fade));
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

    // Animate impact particles
    if (impactParticles.current) {
      let needsParticleUpdate = false;
      const gravity = new THREE.Vector3(0, -9.8, 0); // Gravity
      const particleMatrix = new THREE.Matrix4();

      particleData.current.forEach((data, index) => {
        if (!data.active) return;

        data.life += delta;

        if (data.life >= data.maxLife) {
          data.active = false;
          particleMatrix.makeScale(0, 0, 0);
          needsParticleUpdate = true;
        } else {
          // Apply gravity
          data.velocity.add(gravity.clone().multiplyScalar(delta));

          // Update position
          data.position.add(data.velocity.clone().multiplyScalar(delta));

          // Calculate scale based on life (fade out)
          const lifeRatio = data.life / data.maxLife;
          const scale = 3; // Shrink as it dies

          particleMatrix.makeTranslation(data.position.x, data.position.y, data.position.z);
          particleMatrix.scale(new THREE.Vector3(scale, scale, scale));
          needsParticleUpdate = true;
        }

        impactParticles.current?.setMatrixAt(index, particleMatrix);
      });

      if (needsParticleUpdate) {
        impactParticles.current.instanceMatrix.needsUpdate = true;
      }
    }


    if (isTriggerHeld.current && !isReloading.current) {
      const now = performance.now();
      if (now - lastFireTime.current >= fireRateMs) {
        shootBullet();
      }
    }

  });

  useEffect(() => {
    let animationFrame: number;
    const animateReload = () => {
      if (isReloading.current) {
        const time = Date.now() % 1200 / 1200;
        const rotationX = -Math.sin(time * Math.PI) * 0.3;
        if (gunRef.current) {
          gunRef.current.rotation.x = rotationX;
        }
        animationFrame = requestAnimationFrame(animateReload);
      } else if (gunRef.current) {
        gunRef.current.rotation.x = 0;
      }
    };

    animationFrame = requestAnimationFrame(animateReload);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  return (
    <group frustumCulled={true} ref={gunRef} position={[0.5, -1.5, -0.5]}>
      <mesh>
        <boxGeometry args={[0.4, 0.2, 1]} />
        <meshStandardMaterial color="gray" />
      </mesh>
      <mesh position={[0, 0, -0.7]}>
        <cylinderGeometry args={[0.05, 0.05, 0.5, 16]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh ref={barrelEndRef} position={[0, 0, -0.95]} visible={false}>
        <boxGeometry args={[0.01, 0.01, 0.01]} />
        <meshBasicMaterial opacity={0} transparent />
      </mesh>
      <mesh position={[0, -0.2, -0.3]}>
        <boxGeometry args={[0.3, 0.3, 0.15]} />
        <meshStandardMaterial color="darkgray" />
      </mesh>
      {muzzleFlash.current && (
        <>
          <mesh position={[0, 0, -0.95]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshBasicMaterial color="orange" />
          </mesh>
          <pointLight position={[0, 0, -0.95]} color="orange" intensity={5} distance={2} />
        </>
      )}
      {isReloading.current && (
        <mesh position={[0, -0.5 - Math.sin((Date.now() % 1200) / 1200 * Math.PI) * 0.3, -0.3]}>
          <boxGeometry args={[0.28, 0.28, 0.13]} />
          <meshStandardMaterial color="black" />
        </mesh>
      )}
    </group>
  );
};

export default Gun;
