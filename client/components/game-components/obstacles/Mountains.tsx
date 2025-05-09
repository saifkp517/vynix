import { useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { SimplexNoise } from 'three-stdlib';

// Mountain Component with improved visuals
export const Mountains = () => {
  // Simple noise function for displacement
  const simplex = useMemo(() => new SimplexNoise(), []);
  
  const generateMountainGeometry = useCallback((width, height, detail) => {

    const geometry = new THREE.PlaneGeometry(width, height, detail, detail);
    const positions = geometry.attributes.position;
    
    // Apply height variation to vertices
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      
      // Keep base flat, increase height toward back
      const distanceFromCenter = Math.sqrt(x * x + z * z) / 600;
      const heightFactor = Math.max(0, 1 - distanceFromCenter);
      
      // Apply noise-based displacement
      const elevation = simplex.noise(x * 0.003, z * 0.003) * 50 * heightFactor;
      positions.setY(i, y + elevation);
    }
    
    // Recalculate normals for better lighting
    geometry.computeVertexNormals();
    return geometry;
  }, [simplex]);
  
  // Mountain colors with slight variation
const northColor = new THREE.Color('#8FA3BF').lerp(new THREE.Color('#6D8299'), 1);
const southColor = new THREE.Color('#8FA3BF').lerp(new THREE.Color('#A1B5C8'), 1);
const eastColor = new THREE.Color('#8FA3BF').lerp(new THREE.Color('#7B93A8'), 1);
const westColor = new THREE.Color('#8FA3BF').lerp(new THREE.Color('#9BB0C1'), 1);

  return (
    <>
      {/* Mountains North */}
      <mesh position={[0, 30, -600]} rotation={[-0.3, 0, 0]}>
        <primitive object={generateMountainGeometry(3000, 600, 32)} />
        <meshStandardMaterial 
          color={northColor} 
          transparent 
          opacity={0.9} 
          roughness={0.8} 
          metalness={0.1} 
          side={THREE.DoubleSide} 
          flatShading={true}
        />
      </mesh>

      {/* Mountains South */}
      <mesh position={[0, 30, 600]} rotation={[0.3, Math.PI, 0]}>
        <primitive object={generateMountainGeometry(3000, 600, 32)} />
        <meshStandardMaterial 
          color={southColor} 
          transparent 
          opacity={0.9} 
          roughness={0.8} 
          metalness={0.1} 
          side={THREE.DoubleSide} 
          flatShading={true}
        />
      </mesh>

      {/* Mountains East */}
      <mesh position={[600, 30, 0]} rotation={[-0.3, -Math.PI / 2, 0]}>
        <primitive object={generateMountainGeometry(3000, 600, 32)} />
        <meshStandardMaterial 
          color={eastColor} 
          transparent 
          opacity={0.9} 
          roughness={0.8} 
          metalness={0.1} 
          side={THREE.DoubleSide} 
          flatShading={true}
        />
      </mesh>

      {/* Mountains West */}
      <mesh position={[-600, 30, 0]} rotation={[-0.3, Math.PI / 2, 0]}>
        <primitive object={generateMountainGeometry(3000, 600, 32)} />
        <meshStandardMaterial 
          color={westColor} 
          transparent 
          opacity={0.9} 
          roughness={0.8} 
          metalness={0.1} 
          side={THREE.DoubleSide} 
          flatShading={true}
        />
      </mesh>
    </>
  );
};