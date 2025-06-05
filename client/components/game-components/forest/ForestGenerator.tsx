// ForestGenerator.tsx
'use client';
import React, { useEffect, useRef, useState, useMemo, useTransition } from 'react';
import { TreeVisual, TreeColliders } from '../obstacles/Tree';
import * as THREE from 'three';
import socket from '@/lib/socket';
import type { Vegetation } from '@/app/types/types';

interface ForestProps {
  vegetationPositions: Vegetation[];
  addObstacleRef: (ref: THREE.Mesh | null) => void;
  getGroundHeight: (x: number, z: number) => number;
}

interface ForestUpdateEvent {
  id: string;
  position: { x: number; y: number; z: number };
}

// Main Forest component
export const Forest: React.FC<ForestProps> = ({
  vegetationPositions,
  addObstacleRef,
  getGroundHeight
}) => {

  const [visibleVegetation, setVisibleVegetation] = useState<Map<string, Vegetation>>(new Map());
  const [isPending, startTransition] = useTransition();
  const poolRef = useRef<Vegetation[]>([]);
  const currentPosRef = useRef<[number, number, number]>([0, 0, 0]);

  const debounceTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const getVegetationId = (veg: Vegetation, index: number): string => {
    return veg.id || `${veg.type}-${veg.position[0]}-${veg.position[1]}-${veg.position[2]}-${index}`;
  };

  useEffect(() => {
    const handleUpdateForest = ({ id, position }: ForestUpdateEvent) => {
      currentPosRef.current = [position.x, position.y, position.z];

      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      debounceTimeoutRef.current = setTimeout(() => {
        const RADIUS = 200;
        const RADIUS_SQUARED = RADIUS * RADIUS;

        const visible = vegetationPositions.filter((veg: Vegetation) => {
          const dx = veg.position[0] - position.x;
          const dy = veg.position[1] - position.y;
          const dz = veg.position[2] - position.z;
          return (dx * dx + dy * dy + dz * dz) <= RADIUS_SQUARED;
        });

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
      }, 64); // ~60fps debounce
    };

    socket.on("updateForest", handleUpdateForest);
    socket.emit("requestForestUpdate");

    return () => {
      socket.off("updateForest", handleUpdateForest);
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [vegetationPositions]);

  // Convert Map to arrays for rendering
  const visibleTrees = useMemo((): Vegetation[] =>
    Array.from(visibleVegetation.values()).filter(v => v.type === 'tree'),
    [visibleVegetation]
  );

  const visibleGrass = useMemo((): Vegetation[] =>
    Array.from(visibleVegetation.values()).filter(v => v.type === 'grass'),
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
