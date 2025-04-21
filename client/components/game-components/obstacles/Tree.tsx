import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';

// Majestic giant tree component inspired by sequoias and banyan trees
export const Tree = React.forwardRef(({
  position,
  scale = 1,
  type = "banyan", // "sequoia" or "banyan"
  ageVariation = 1, // Affects girth and majesty (0.7-1.3 is good range)
  getGroundHeight = null, // Function to get ground height at position
}, ref) => {
  // Create persistent unique seed for this tree instance
  const treeSeed = useMemo(() => Math.random(), []);
  
  // Different tree types
  const treeTypes = {
    sequoia: {
      trunkColor: "#8B4513", // Rich brown
      barkDetailColor: "#5D4037", // Darker brown for texture
      foliageColor: "#006400", // Dark green
      trunkHeight: 50 * ageVariation,
      trunkRadiusTop: 3 * ageVariation,
      trunkRadiusBottom: 7 * ageVariation,
      barkRoughness: 0.9,
      foliageDensity: 0.8,
      conicalTop: true
    },
    banyan: {
      trunkColor: "#6D4C41", // Medium brown
      barkDetailColor: "#4E342E", // Darker brown
      foliageColor: "#1B5E20", // Deep green
      trunkHeight: 30 * ageVariation,
      trunkRadiusTop: 4 * ageVariation,
      trunkRadiusBottom: 8 * ageVariation,
      barkRoughness: 0.85,
      foliageDensity: 1,
      aerialRoots: true,
      wideCanopy: true
    }
  };

  const selectedType = treeTypes[type] || treeTypes.sequoia;
  
  // Calculate ground height
  const groundHeight = useMemo(() => {
    if (getGroundHeight) {
      const [x, _, z] = position;
      return getGroundHeight(x, z) || 0;
    }
    return 0;
  }, [position, getGroundHeight]);
  
  // Actual position including ground height adjustment
  const actualPosition = useMemo(() => {
    return [position[0], position[1] + groundHeight, position[2]];
  }, [position, groundHeight]);

  // A consistent random number generator based on tree seed
  const seededRandom = (index) => {
    const seed = treeSeed + index * 0.1;
    return ((Math.sin(seed) + 1) * 10000) % 1;
  };

  // Create aerial roots for banyan
  const createAerialRoots = () => {
    const roots = [];
    if (selectedType.aerialRoots) {
      const rootCount = Math.floor(10 * ageVariation);

      for (let i = 0; i < rootCount; i++) {
        const angle = (i / rootCount) * Math.PI * 2;
        const radiusFromCenter = (8 + seededRandom(i) * 12) * ageVariation;
        const x = Math.cos(angle) * radiusFromCenter;
        const z = Math.sin(angle) * radiusFromCenter;

        // Root height varies
        const rootHeight = (10 + seededRandom(i + 100) * 8) * ageVariation;
        const thickness = (0.5 + seededRandom(i + 200) * 0.7) * ageVariation;

        // Curved position for the root
        const curveAmount = 2 + seededRandom(i + 300) * 3;
        const midX = x * 0.5 + (seededRandom(i + 400) - 0.5) * curveAmount;
        const midZ = z * 0.5 + (seededRandom(i + 500) - 0.5) * curveAmount;

        roots.push(
          <group key={`root-${i}`}>
            {/* Create a curved path for the root */}
            <mesh>
              <tubeGeometry
                args={[
                  new THREE.CatmullRomCurve3([
                    new THREE.Vector3(0, selectedType.trunkHeight * 0.3, 0), // Start from trunk
                    new THREE.Vector3(midX, selectedType.trunkHeight * 0.15, midZ), // Mid curve point
                    new THREE.Vector3(x, 0, z) // Ground point
                  ]),
                  8, // tubular segments
                  thickness, // radius
                  8, // radial segments
                  false // closed
                ]}
              />
              <meshStandardMaterial
                color={selectedType.trunkColor}
                roughness={selectedType.barkRoughness}
              />
            </mesh>
          </group>
        );
      }
    }
    return roots;
  };

  // Create bark detail and texture
  const createBarkDetail = () => {
    const barkDetails = [];
    const detailCount = Math.floor(40 * ageVariation);

    for (let i = 0; i < detailCount; i++) {
      const angle = seededRandom(i + 600) * Math.PI * 2;
      const heightPercent = seededRandom(i + 700);
      const radius = selectedType.trunkRadiusBottom -
        (selectedType.trunkRadiusBottom - selectedType.trunkRadiusTop) * heightPercent;

      const x = Math.cos(angle) * (radius + 0.05);
      const z = Math.sin(angle) * (radius + 0.05);
      const y = heightPercent * selectedType.trunkHeight;

      const detailWidth = 0.5 + seededRandom(i + 800) * 1.5;
      const detailHeight = 1 + seededRandom(i + 900) * 3;

      barkDetails.push(
        <mesh key={`bark-${i}`} position={[x, y, z]} rotation={[0, angle, 0]}>
          <boxGeometry args={[0.3, detailHeight, detailWidth]} />
          <meshStandardMaterial
            color={selectedType.barkDetailColor}
            roughness={1}
          />
        </mesh>
      );
    }

    return barkDetails;
  };

  // Create foliage based on tree type
  const createFoliage = () => {
    if (selectedType.conicalTop) {
      // For sequoia - conical top
      return (
        <group position={[0, selectedType.trunkHeight * 0.8, 0]}>
          <mesh position={[0, selectedType.trunkHeight * 0.3, 0]}>
            <coneGeometry
              args={[
                selectedType.trunkRadiusBottom * 1.8,
                selectedType.trunkHeight * 0.6,
                16
              ]}
            />
            <meshStandardMaterial
              color={selectedType.foliageColor}
              roughness={0.8}
            />
          </mesh>
        </group>
      );
    } else if (selectedType.wideCanopy) {
      // For banyan - wide spreading canopy
      const foliageParts = [];
      const canopyWidth = selectedType.trunkRadiusBottom * 5 * ageVariation;
      const canopySegments = 8;

      for (let i = 0; i < canopySegments; i++) {
        const angle = (i / canopySegments) * Math.PI * 2;
        const offset = canopyWidth * 0.5;
        const x = Math.cos(angle) * offset;
        const z = Math.sin(angle) * offset;

        // Main canopy chunks
        foliageParts.push(
          <mesh key={`canopy-${i}`} position={[x, selectedType.trunkHeight * 0.9, z]}>
            <sphereGeometry args={[canopyWidth * 0.4, 16, 16]} />
            <meshStandardMaterial
              color={selectedType.foliageColor}
              roughness={0.8}
            />
          </mesh>
        );

        // Additional smaller foliage pieces for density
        if (seededRandom(i + 1000) > 0.3) {
          const smallX = x + (seededRandom(i + 1100) - 0.5) * canopyWidth * 0.5;
          const smallZ = z + (seededRandom(i + 1200) - 0.5) * canopyWidth * 0.5;
          const height = selectedType.trunkHeight * (0.7 + seededRandom(i + 1300) * 0.4);

          foliageParts.push(
            <mesh key={`canopy-detail-${i}`} position={[smallX, height, smallZ]}>
              <sphereGeometry args={[canopyWidth * 0.25, 12, 12]} />
              <meshStandardMaterial
                color={selectedType.foliageColor}
                roughness={0.8}
              />
            </mesh>
          );
        }
      }

      // Central canopy
      foliageParts.push(
        <mesh key="central-canopy" position={[0, selectedType.trunkHeight * 1.1, 0]}>
          <sphereGeometry args={[canopyWidth * 0.5, 16, 16]} />
          <meshStandardMaterial
            color={selectedType.foliageColor}
            roughness={0.8}
          />
        </mesh>
      );

      return <group>{foliageParts}</group>;
    }

    return null;
  };

  return (
    <group
      position={[actualPosition[0], actualPosition[1], actualPosition[2]]}
      scale={scale}
      
    >
      {/* Main Trunk - with ref for collision detection */}
      <mesh
        position={[0, selectedType.trunkHeight / 2, 0]}
        ref={ref}  
      >
        <cylinderGeometry
          args={[
            selectedType.trunkRadiusTop,
            selectedType.trunkRadiusBottom,
            selectedType.trunkHeight,
            24
          ]}
        />
        <meshStandardMaterial
          color={selectedType.trunkColor}
          roughness={selectedType.barkRoughness}
        />
      </mesh>

      {/* Add bark detail and texture */}
      {createBarkDetail()}

      {/* Add aerial roots for banyan trees */}
      {createAerialRoots()}

      {/* Add foliage */}
      {createFoliage()}

      {/* Add roots at the base */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry
          args={[
            selectedType.trunkRadiusBottom * 1.5,
            selectedType.trunkRadiusBottom * 2.5,
            2,
            16
          ]}
        />
        <meshStandardMaterial
          color={selectedType.trunkColor}
          roughness={1}
        />
      </mesh>
    </group>
  );
});