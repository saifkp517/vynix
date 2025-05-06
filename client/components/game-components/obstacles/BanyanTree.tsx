import React, { useRef, useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useFBX } from '@react-three/drei';

// Define the tree position interface
interface TreePosition {
  position: [number, number, number];
  rotation: number;
  scale: number;
}

const BanyanTreeFBX: React.FC<{ 
  positions: TreePosition[], 
  modelPath: string,
  windIntensity?: number 
}> = ({ 
  positions, 
  modelPath, 
  windIntensity = 0.2 
}) => {
  const groupRef = useRef<THREE.Group>(null);
  
  // Load the FBX model with proper FBX loader
  const fbxModel = useFBX(modelPath);
  
  // Extract meshes from the FBX model for instancing
  const [meshes, setMeshes] = useState<{
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    name: string;
  }[]>([]);
  
  // Create refs for all instanced meshes
  const instancedMeshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  
  // Create a dummy object for matrix manipulation
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  // Extract meshes from the loaded model
  useEffect(() => {
    const extractedMeshes: {
      geometry: THREE.BufferGeometry;
      material: THREE.Material;
      name: string;
    }[] = [];
    
    fbxModel.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Clone the geometry to ensure we don't modify the original
        const geometry = child.geometry.clone();
        
        // Store original positions for wind animation
        const posAttr = geometry.attributes.position;
        const originalPositions = new Float32Array(posAttr.array.length);
        originalPositions.set(posAttr.array);
        geometry.userData.originalPositions = originalPositions;
        
        // Store the mesh data
        extractedMeshes.push({
          geometry,
          material: child.material,
          name: child.name || `mesh-${extractedMeshes.length}`
        });
      }
    });
    
    setMeshes(extractedMeshes);
    
    // Initialize refs array with the correct length
    instancedMeshRefs.current = new Array(extractedMeshes.length).fill(null);
  }, [fbxModel]);
  
  // Set up the instance matrices when positions or meshes change
  useEffect(() => {
    if (meshes.length === 0) return;
    
    meshes.forEach((_, meshIndex) => {
      const instancedMesh = instancedMeshRefs.current[meshIndex];
      if (!instancedMesh) return;
      
      // Set up each instance
      positions.forEach((treePos, instanceIndex) => {
        const { position, rotation, scale } = treePos;
        
        // Set position, rotation, scale
        dummy.position.set(...position);
        dummy.rotation.set(0, rotation, 0);
        dummy.scale.set(scale, scale, scale);
        
        // Update matrix and set for this instance
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(instanceIndex, dummy.matrix);
      });
      
      // Mark the instance matrix as needing an update
      instancedMesh.instanceMatrix.needsUpdate = true;
    });
  }, [positions, meshes]);
  
  // Wind animation
  useFrame(({ clock }) => {
    if (meshes.length === 0) return;
    
    meshes.forEach((mesh, meshIndex) => {
      const instancedMesh = instancedMeshRefs.current[meshIndex];
      if (!instancedMesh) return;
      
      // Get the original positions
      const originalPositions = mesh.geometry.userData.originalPositions;
      if (!originalPositions) return;
      
      // Get position attribute for modification
      const posAttr = mesh.geometry.attributes.position;
      
      // Apply wind effect - higher vertices sway more
      for (let i = 0; i < posAttr.count; i++) {
        const originalY = originalPositions[i * 3 + 1];
        
        // Calculate sway factor based on height (y value)
        // Top parts of the tree sway more than the bottom
        const swayFactor = Math.max(0, Math.min(1, originalY / 10));
        
        // Time-based wind effect
        const time = clock.elapsedTime * 0.5;
        const xPos = originalPositions[i * 3];
        const zPos = originalPositions[i * 3 + 2];
        
        // Calculate wind offset
        const windOffsetX = Math.sin(time + xPos * 0.05) * windIntensity * swayFactor;
        const windOffsetZ = Math.cos(time + zPos * 0.05) * windIntensity * swayFactor;
        
        // Apply wind effect to current position
        posAttr.setXYZ(
          i,
          originalPositions[i * 3] + windOffsetX,
          originalPositions[i * 3 + 1],
          originalPositions[i * 3 + 2] + windOffsetZ
        );
      }
      
      // Mark the position attribute as needing an update
      posAttr.needsUpdate = true;
    });
  });
  
  return (
    <group ref={groupRef}>
      {meshes.map((mesh, index) => (
        <instancedMesh
          key={mesh.name}
          ref={(el) => { instancedMeshRefs.current[index] = el; }}
          args={[mesh.geometry, mesh.material, positions.length]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
};

// No need to preload with useFBX

export default BanyanTreeFBX;