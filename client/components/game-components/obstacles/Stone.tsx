'use client';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ObjectLoader, MaterialLoader } from 'three';
import * as THREE from 'three';
import socket from '@/lib/socket';
import { useFrame } from '@react-three/fiber';
import type { Vegetation } from '@/app/types/types';
import { TreeVisual, TreeColliders } from '../obstacles/Tree';

interface ForestProps {
  vegetationPositions: Vegetation[];
  addObstacleRef: (ref: THREE.Mesh | null) => void;
  getGroundHeight: (x: number, z: number) => number;
}

export const StoneVisual: React.FC<{
  positions: Vegetation[],
  getGroundHeight: (x: number, z: number) => number;
}> = ({ positions, getGroundHeight }) => {
  // Create stone geometry with natural variation
  const geometry = useMemo(() => {
    const stoneGeo = new THREE.DodecahedronGeometry(2.5, 0); // Increased radius for larger base shape
    modifyGeometryForNaturalLook(stoneGeo);
    return stoneGeo;
  }, []);

  // Helper function to add imperfections to geometry
  function modifyGeometryForNaturalLook(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const normal = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i++) {
      normal.fromBufferAttribute(geometry.attributes.normal as THREE.BufferAttribute, i);

      // Get current position
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);

      // Calculate noise for a rocky surface
      const noise = simplex3D(x * 0.6, y * 0.6, z * 0.6) * 0.2;

      // Apply noise in the direction of the normal for a rugged look
      posAttr.setX(i, x + normal.x * noise);
      posAttr.setY(i, y + normal.y * noise);
      posAttr.setZ(i, z + normal.z * noise);
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  // Simplified 3D simplex noise function
  function simplex3D(x: number, y: number, z: number) {
    const dot = x * 12.9898 + y * 78.233 + z * 37.719;
    return Math.sin(dot) * 43758.5453 % 1;
  }

  // Create procedural rocky texture
  function createRockTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Base color: grayish
    if (ctx) {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, 256, 256);
    }

    // Add rocky variations
    if (ctx) {
      for (let i = 0; i < 50; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const radius = 10 + Math.random() * 20;

        // Create speckled patterns
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = rgba(
          100 + Math.random() * 40,
          100 + Math.random() * 40,
          100 + Math.random() * 40,
          0.6
        );
        ctx.fill();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    return texture;
  }

  // Rocky material
  const material = useMemo(() => {
    const rockTexture = createRockTexture();
    return new THREE.MeshStandardMaterial({
      color: '#808080',
      roughness: 0.9,
      metalness: 0.1,
      map: rockTexture,
      normalScale: new THREE.Vector2(0.5, 0.5),
      bumpScale: 0.3,
      side: THREE.DoubleSide, //enable backface culling to prevent seeing inside the stone
    });
  }, []);

  // Mesh reference for instanced stones
  const stoneRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Subtle animation for stones (e.g., slight wobble to simulate settling)
  useFrame(({ clock }) => {
    if (!stoneRef.current) return;

    for (let i = 0; i < positions.length; i++) {
      stoneRef.current.getMatrixAt(i, dummy.matrix);
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      dummy.matrix.decompose(position, quaternion, scale);

      // Subtle wobble
      const wobble = Math.sin(clock.elapsedTime * 0.3 + i) * 0.02;
      dummy.rotation.y = wobble;
      dummy.position.copy(position);
      dummy.scale.copy(scale);

      dummy.updateMatrix();
      stoneRef.current.setMatrixAt(i, dummy.matrix);
    }

    stoneRef.current.instanceMatrix.needsUpdate = true;
  });

  // Position stones on the terrain
  useEffect(() => {
    if (!stoneRef.current) return;

    positions.forEach((stonePos, i) => {
      const { position, rotation, scale } = stonePos;
      const baseScale = scale * 2.0; // Increased base scale for larger stones

      // Align with ground height
      const groundHeight = getGroundHeight(position[0], position[2]);

      dummy.position.set(
        position[0],
        groundHeight + 0.7 * baseScale, // Increased offset to avoid clipping with larger size
        position[2]
      );
      dummy.rotation.set(
        Math.random() * 0.3 - 0.15, // Random tilt for natural look
        rotation + Math.random() * Math.PI,
        Math.random() * 0.3 - 0.15
      );
      dummy.scale.set(
        baseScale * (1.2 + Math.random() * 0.8), // Wider in x direction
        baseScale * (0.5 + Math.random() * 0.6), // Shorter in y direction
        baseScale * (1.2 + Math.random() * 0.4)  // Wider in z direction
      );
      dummy.updateMatrix();
      stoneRef.current?.setMatrixAt(i, dummy.matrix);
    });

    stoneRef.current.instanceMatrix.needsUpdate = true;
  }, [positions, getGroundHeight]);

  return (
    <instancedMesh
      ref={stoneRef}
      args={[geometry, material, positions.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
};

export const StoneColliders: React.FC<{
  positions: Vegetation[];
  addObstacleRef: (ref: THREE.Mesh | null) => void;
  getGroundHeight: (x: number, z: number) => number;
}> = ({ positions, addObstacleRef, getGroundHeight }) => {
  const colliderRefs = useRef<(THREE.Mesh | null)[]>([]);

  useEffect(() => {
    colliderRefs.current = Array(positions.length).fill(null);
  }, [positions.length]);

  return (
    <>
      {positions.map((stonePos, index) => (
        <mesh
          name='stone'
          key={`stone-collider-${index}`}
          ref={(ref) => {
            if (colliderRefs.current) {
              colliderRefs.current[index] = ref;
              addObstacleRef(ref);
            }
          }}
          position={[
            stonePos.position[0],
            getGroundHeight(stonePos.position[0], stonePos.position[2]) + 0.7 * stonePos.scale * 2.0, // Adjusted for larger stones
            stonePos.position[2]
          ]}
          frustumCulled={false}
          scale={[stonePos.scale * 2.0, stonePos.scale * 0.6, stonePos.scale * 2.0]} // Wider collider
        >
          <boxGeometry args={[5, 2, 5]} /> {/* Increased collider size */}
          <meshBasicMaterial visible={false} />
        </mesh>
      ))}
    </>
  );
};

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}