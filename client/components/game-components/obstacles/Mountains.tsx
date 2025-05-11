import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SimplexNoise } from 'three-stdlib';

// Mountain Component that creates borders around a square map
export const Mountains = ({ mapSize = 1000, height = 400, thickness = 250, detail = 64 }) => {
  // Create a new simplex noise instance
  const simplex = useMemo(() => new SimplexNoise(), []);
  
  // Create noise function for mountain displacement
  const getNoise = (x: number, z: number, frequency = 0.02, amplitude = 1) => {
    return simplex.noise(x * frequency, z * frequency) * amplitude;
  };

  // Generate mountain geometry with noise - wider, gentler slopes
  const createMountainGeometry = (width: number, depth: number, isX = false) => {
    // Create a wider base geometry
    const geometry = new THREE.BoxGeometry(
      isX ? thickness : width,
      height,
      isX ? width : thickness,
      isX ? 1 : detail,
      24, // More vertical segments for smoother slopes
      isX ? detail : 1
    );
    
    // Apply more gentle noise to vertices
    const positionAttribute = geometry.attributes.position;
    
    // Calculate slope profile - exponential falloff from center
    const getSlopeProfile = (distanceFromCenter: number, maxWidth: number) => {
      // Normalize distance (0 to 1)
      const normalizedDist = Math.abs(distanceFromCenter) / (maxWidth / 2);
      // Create a gentle falloff - higher mountains in center, tapering to edges
      return Math.pow(1 - Math.min(normalizedDist, 1), 2);
    };
    
    for (let i = 0; i < positionAttribute.count; i++) {
      const x = positionAttribute.getX(i);
      const y = positionAttribute.getY(i);
      const z = positionAttribute.getZ(i);
      
      // Calculate distance from center for slope profile
      const relevantCoord = isX ? z : x;
      const slopeProfile = getSlopeProfile(relevantCoord, isX ? width : width);
      
      // Only displace non-bottom vertices
      if (y > 0) {
        // Base height adjustment - higher in center, lower on edges
        const baseHeight = y * slopeProfile * 0.7; // Gentle slope
        
        // Much gentler noise frequencies for large-scale features
        const largeFeatures = getNoise(
          isX ? z : x, 
          isX ? x : z, 
          0.003, // Very low frequency for wide features
          100 * slopeProfile
        );
        
        // Medium features for natural variation
        const mediumFeatures = getNoise(
          isX ? z * 1.5 : x * 1.5, 
          isX ? x * 1.5 : z * 1.5, 
          0.01, 
          20 * slopeProfile
        );
        
        // Small details - subtle and minimal
        const smallDetails = getNoise(
          isX ? z * 3 : x * 3, 
          isX ? x * 3 : z * 3, 
          0.03, 
          35 * slopeProfile
        );
        
        positionAttribute.setY(i, baseHeight + largeFeatures + mediumFeatures + smallDetails);
      }
    }
    
    geometry.computeVertexNormals();
    return geometry;
  };
  
  // Create mountain materials with more natural coloring
  const mountainMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x5a6352, // More natural greenish-gray mountain color
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
      vertexColors: false
    });
  }, []);

  // Snow cap material
  const snowMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.7,
      metalness: 0.1,
      flatShading: true
    });
  }, []);
  
  // Pre-calculate positions
  const halfMap = mapSize / 2;
  const offset = halfMap + thickness / 2;
  
  return (
    <group>
      {/* North Mountains - wider with more gentle slopes */}
      <mesh 
        position={[0, height / 2, -offset]} 
        geometry={createMountainGeometry(mapSize + thickness * 2, thickness)}
        material={mountainMaterial}
        castShadow
        receiveShadow
      >
      </mesh>
      
      {/* South Mountains */}
      <mesh 
        position={[0, height / 2, offset]} 
        geometry={createMountainGeometry(mapSize + thickness * 2, thickness)}
        material={mountainMaterial}
        castShadow
        receiveShadow
      >

      </mesh>
      
      {/* East Mountains */}
      <mesh 
        position={[offset, height / 2, 0]} 
        geometry={createMountainGeometry(mapSize + thickness * 2, thickness, true)}
        material={mountainMaterial}
        castShadow
        receiveShadow
      >

      </mesh>
      
      {/* West Mountains */}
      <mesh 
        position={[-offset, height / 2, 0]} 
        geometry={createMountainGeometry(mapSize + thickness * 2, thickness, true)}
        material={mountainMaterial}
        castShadow
        receiveShadow
      >

      </mesh>
    </group>
  );
};