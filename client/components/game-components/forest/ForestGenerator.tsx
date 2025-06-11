// ForestGenerator.tsx
'use client';
import React, { useEffect, useRef, useState, useMemo, useTransition, RefObject } from 'react';
import { TreeVisual, TreeColliders } from '../obstacles/Tree';
import * as THREE from 'three';
import type { Vegetation } from '@/app/types/types';
import { useFrame } from '@react-three/fiber';

interface ForestProps {
  vegetationPositions: Vegetation[];
  addObstacleRef: (ref: THREE.Mesh | null) => void;
  getGroundHeight: (x: number, z: number) => number;
  playerCenterRef: RefObject<THREE.Vector3>;
}


// Main Forest component
export const Forest: React.FC<ForestProps> = ({
  vegetationPositions,
  addObstacleRef,
  getGroundHeight,
  playerCenterRef
}) => {

  const [visibleVegetation, setVisibleVegetation] = useState<Map<string, Vegetation>>(new Map());
  const [isPending, startTransition] = useTransition();
  const poolRef = useRef<Vegetation[]>([]);
  const currentPosRef = useRef<[number, number, number]>([0, 0, 0]);

  const debounceTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const getVegetationId = (veg: Vegetation, index: number): string => {
    return veg.id || `${veg.type}-${veg.position[0]}-${veg.position[1]}-${veg.position[2]}-${index}`;
  };

  const handleUpdateForest = (position: THREE.Vector3) => {
    currentPosRef.current = [position.x, position.y, position.z];

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      const RADIUS = 150;
      const RADIUS_SQUARED = RADIUS * RADIUS;

      const visible = vegetationPositions.filter((veg: Vegetation) => {
        const dx = veg.position[0] - position.x;
        const dy = veg.position[1] - position.y;
        const dz = veg.position[2] - position.z;
        return (dx * dx + dy * dy + dz * dz) <= RADIUS_SQUARED;
      });

      console.log(visible.length)
      startTransition(() => {
        setVisibleVegetation(prevMap => {
          // Create set of currently visible IDs
          const currentlyVisibleIds = new Set<string>();

          visible.forEach((veg: Vegetation, index: number) => {
            const vegId = getVegetationId(veg, index);
            currentlyVisibleIds.add(vegId);
          });

          // Start with the previous map to preserve existing entries
          const updatedMap = new Map(prevMap);

          // Remove trees that are no longer visible
          for (const [id] of prevMap) {
            if (!currentlyVisibleIds.has(id)) {
              updatedMap.delete(id);
            }
          }

          // Add new trees that weren't in the previous map
          visible.forEach((veg: Vegetation, index: number) => {
            const vegId = getVegetationId(veg, index);

            if (!prevMap.has(vegId)) {
              updatedMap.set(vegId, {
                ...veg,
                id: vegId
              });
            }
          });

          return updatedMap;
        });
      });
    }, 16); // ~60fps debounce
  };
  //generate forest initially
  const newCenterRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    handleUpdateForest(new THREE.Vector3(0, 0, 0));
  }, [])

  //update forest position as player moves
  const lastCheckRef = useRef(performance.now());

  useFrame(() => {
    if (!playerCenterRef.current) return;

    const now = performance.now();
    const checkInterval = 1000 / 60 * 50; // 5 frames ≈ 83.33ms
    const innerRadius = 100;

    if (now - lastCheckRef.current >= checkInterval) {
      const distance = playerCenterRef.current.distanceTo(newCenterRef.current);
      console.log("Distance:", distance);

      if (distance > innerRadius) {
        newCenterRef.current.copy(playerCenterRef.current);
        handleUpdateForest(playerCenterRef.current);
      }

      lastCheckRef.current = now;
    }
  });
  // Convert Map to arrays for rendering
  const visibleTrees = useMemo((): Vegetation[] =>
    Array.from(visibleVegetation.values()).filter(v => v.type === 'tree'),
    [visibleVegetation]
  );

  console.log('Rendering trees:', visibleTrees.length, 'isPending:', isPending);

  return (
    <group name="forest">
      <TreeVisual
        positions={visibleTrees}
        getGroundHeight={getGroundHeight}
        key="trees"
      />
      <TreeColliders
        positions={visibleTrees}
        addObstacleRef={addObstacleRef}
        key="colliders"
      />
    </group>
  );
};
