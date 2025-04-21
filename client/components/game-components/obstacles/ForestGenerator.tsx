import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Tree } from './Tree'; // Import your Tree component

export const Forest = ({
  center = [0, 0, 0],
  radius = 50,
  density = 0.8, // trees per 100 square units (0.1 - sparse, 1.0 - dense)
  minDistance = 10, // Minimum distance between trees
  types = ["sequoia", "banyan"], // Tree types to use
  getGroundHeight,
  addObstacleRef, // Function to add obstacle ref to obstacles array
  minScale = 0.4,
  maxScale = 0.6,
  minVariation = 0.7,
  maxVariation = 1.2,
  avoidCenter = 15, // Radius around center to avoid placing trees (for player spawn area)
}: any) => {
  const placedTrees = useRef([]);
  
  // Generate a pseudo-random but deterministic value based on position
  const getRandomFromPosition = (x: number, z: number, seed = 0) => {
    return Math.abs(Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453) % 1;
  };
  
  // Check if position is valid (not too close to other trees and within radius)
  const isValidPosition = (x: number, z: number) => {
    // Check if within forest radius
    const distanceFromCenter = Math.sqrt(
      Math.pow(x - center[0], 2) + Math.pow(z - center[2], 2)
    );
    
    if (distanceFromCenter > radius) return false;
    
    // Check if too close to center (player spawn area)
    if (distanceFromCenter < avoidCenter) return false;
    
    // Check distance from other trees
    for (const pos of placedTrees.current) {
      const distance = Math.sqrt(Math.pow(x - pos[0], 2) + Math.pow(z - pos[1], 2));
      if (distance < minDistance) return false;
    }
    
    return true;
  };
  
  // Generate trees based on density and radius
  useEffect(() => {
    // Clean up function to store refs for cleanup
    const treeRefs: any[] = [];
    
    // Calculate area and number of trees
    const area = Math.PI * radius * radius;
    const treeCount = Math.floor((area / 100) * density);
    
    // Try to place trees using Poisson disc sampling
    const generateForest = () => {
      // Reset placed trees
      placedTrees.current = [];
      
      // Initial random positions to try
      const attempts = treeCount * 10; // Try 10x the number of trees we want
      
      for (let i = 0; i < attempts && placedTrees.current.length < treeCount; i++) {
        // Generate a random position within the circle
        const angle = 2 * Math.PI * getRandomFromPosition(i, 0, 1);
        const distance = radius * Math.sqrt(getRandomFromPosition(0, i, 2));
        
        const x = center[0] + distance * Math.cos(angle);
        const z = center[2] + distance * Math.sin(angle);
        
        if (isValidPosition(x, z)) {
          placedTrees.current.push([x, z]);
        }
      }
    };
    
    generateForest();
    
    return () => {
      // Clean up logic if needed
      treeRefs.forEach(ref => {
        // Any cleanup for tree refs
      });
    };
  }, [center, radius, density, minDistance, avoidCenter]);
  
  return (
    <>
      {placedTrees.current.map((pos, index) => {
        const x = pos[0];
        const z = pos[1];
        
        // Use deterministic randomness for tree properties
        const typeIndex = Math.floor(getRandomFromPosition(x, z, 3) * types.length);
        const treeType = types[typeIndex];
        const scale = minScale + getRandomFromPosition(x, z, 4) * (maxScale - minScale);
        const ageVar = minVariation + getRandomFromPosition(x, z, 5) * (maxVariation - minVariation);
        
        return (
          <Tree
            key={`tree-${index}`}
            position={[x, 0, z]}
            getGroundHeight={getGroundHeight}
            ref={(ref) => ref && addObstacleRef(ref)}
            scale={scale}
            type={treeType}
            ageVariation={ageVar}
          />
        );
      })}
    </>
  );
};