// ForestGenerator.tsx
'use client';
import React, { useEffect, useRef, useState} from 'react';
import { TreeVisual, TreeColliders } from '../obstacles/Tree';
// import { BushVisual } from '../obstacles/Stone';
import * as THREE from 'three';
import socket from '@/lib/socket';
import type { Vegetation } from '@/app/types/types';

interface ForestProps {
  vegetationPositions: Vegetation[];
  addObstacleRef: (ref: THREE.Mesh | null) => void;
  getGroundHeight: (x: number, z: number) => number;
}



// Main Forest component
export const Forest: React.FC<ForestProps> = ({
  vegetationPositions,
  addObstacleRef,
  getGroundHeight
}) => {

  const [visibleTrees, setVisibleTrees] = useState<any[]>([]); // Trees within radius
  const [visibleStones, setVisibleStones] = useState<any[]>([]);
  const poolRef = useRef<any[]>([]); // Reusable tree pool
  const currentPosRef = useRef<[number, number, number]>([0, 0, 0]); // Drone or user position

  useEffect(() => {
    const handleUpdateForest = ({ id, position }: { id: string; position: { x: number; y: number; z: number } }) => {
      currentPosRef.current = [position.x, position.y, position.z];

      const RADIUS = 200; // Change this based on your need

      const visible = vegetationPositions.filter((veg) => {
        const dx = veg.position[0] - position.x;
        const dy = veg.position[1] - position.y;
        const dz = veg.position[2] - position.z;
        return dx * dx + dy * dy + dz * dz <= RADIUS * RADIUS;
      });

      const trees = visible.filter((v) => v.type === 'tree');
      const Stones = visible.filter((v) => v.type === 'stone');

      setVisibleTrees(trees);
      setVisibleStones(Stones);
    };

    socket.on("updateForest", handleUpdateForest);
    socket.emit("requestForestUpdate");

    return () => {
      socket.off("updateForest", handleUpdateForest);
    };
  }, [vegetationPositions]);

  return (
    <group name="forest">
      <TreeVisual positions={visibleTrees} getGroundHeight={getGroundHeight} />
      <TreeColliders positions={visibleTrees} addObstacleRef={addObstacleRef} />

      {/* <StoneVisual positions={visibleStones} getGroundHeight={getGroundHeight} /> */}
    </group>
  );
};
