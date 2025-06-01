import { useThree, useLoader, useFrame } from "@react-three/fiber";
import { createNoise2D } from 'simplex-noise';
import { SimplexNoise } from "three-stdlib";
import React, { Suspense, createContext, useContext, memo } from "react";
import { useEffect, useMemo, useRef, forwardRef, useState } from "react";
import { Zone } from "../zone/Zone";
import { Points } from 'three';
import * as THREE from "three";
import { TextureLoader } from "three";
import socket from "@/lib/socket";
import { Forest } from "../forest/ForestGenerator";
import { Sky } from "@react-three/drei";
import { Mountains } from "../elements/Mountains";
import { RainEffect } from "../elements/Rain";
import TallGrass from "../elements/Grass";
import Loot from "../player/Loot";


import type { Vegetation } from "@/app/types/types";

// Create a context for the ground height function  
type GroundHeightContextType = {
  getGroundHeight: (x: number, z: number) => number;
};

interface TreePosition {
  position: [number, number, number];
  rotation: number;
  scale: number;
}

const GroundHeightContext = createContext<GroundHeightContextType | null>(null);

// Hook to use the ground height from any child component
export const useGroundHeight = () => {
  const context = useContext(GroundHeightContext);
  if (!context) {
    throw new Error("useGroundHeight must be used within a GroundHeightProvider");
  }
  return context.getGroundHeight;
};

type GroundProps = {
  children?: React.ReactNode;
  playerCenterRef: React.RefObject<THREE.Vector3>;
  fogDistance?: number;
  vegetationPositions?: Vegetation[],
  fogColor?: string;
  addObstacleRef: (ref: THREE.Mesh | null) => void;
};

// TallGrass component to add grass blades to the scene

// ForestWrapper component is memoized to prevent unnecessary rerenders
const ForestWrapper = memo(({ center, radius, density, getGroundHeight, addObstacleRef, vegetationPositions }: any) => {
  return (
    <Forest
      vegetationPositions={vegetationPositions}
      addObstacleRef={addObstacleRef}
      getGroundHeight={getGroundHeight}
    />
  );
});

// Main Ground component implementation - wrapped in memo at the end
const GroundBase = forwardRef<THREE.Mesh, GroundProps>(({
  children,
  fogDistance = 1005,
  vegetationPositions,
  fogColor = "#A8B8D0",
  addObstacleRef,
  playerCenterRef
}, ref) => {
  const { scene } = useThree();
  const geometryRef = useRef<THREE.PlaneGeometry>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const [targetPosition, setTargetPosition] = useState([0, 0, 0]);
  const initializedRef = useRef(false);
  // Load textures once
  const [grassMap, roughnessMap, noiseMap] = useLoader(TextureLoader, [
    "/textures/grass.jpg",
    "/textures/grass_rough.jpg",
    "/textures/grass_normal.jpg"
  ]);

  useEffect(() => {
    socket.on('updateForest', ({ id, position }) => {
      setTargetPosition([position.x, position.y, position.z]);
    });

    return () => {
      socket.off("updateForest", ({ id, position }: any) => {
        setTargetPosition([position.x, position.y, position.z]);
      });
    };
  }, [])

  // Create noise-based roughness variation - once during initial render
  const roughnessVariation = useMemo(() => {
    const noise2D = createNoise2D();
    const size = 1024;
    const data = new Uint8Array(size * size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const value =
          0.7 * noise2D(x / 40, y / 40) +
          0.3 * noise2D(x / 10, y / 10);
        const normalized = Math.floor((value + 1) * 127.5);
        data[x + y * size] = normalized;
      }
    }

    const texture = new THREE.DataTexture(
      data, size, size, THREE.RedFormat, THREE.UnsignedByteType
    );
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.needsUpdate = true;

    return texture;
  }, []);

  // Seed for deterministic noise (same on server and client)
  const SEED = 12345; // Use any fixed number for consistent results

  const getGroundHeight = useMemo(() => {
    // Initialize Simplex noise with a seed for deterministic output
    const noise2D = createNoise2D(() => SEED);

    return (x: number, z: number): number => {
      const primaryFrequency = 0.005; // Controls the scale of hills
      const secondaryFrequency = 0.01; // Controls smaller variations
      const amplitude = 25; // Height of hills
      const noiseAmplitude = 3; // Height of smaller variations

      // Primary terrain height using Simplex noise
      const baseHeight = noise2D(x * primaryFrequency, z * primaryFrequency) * amplitude;

      // Secondary noise for additional variation
      const noise = noise2D(x * secondaryFrequency * 3.7, z * secondaryFrequency * 2.3) * noiseAmplitude;

      return baseHeight + noise;
    };
  }, []);

  // Create the context value - memoized to prevent unnecessary renders
  const groundHeightContextValue = useMemo(() => ({
    getGroundHeight
  }), [getGroundHeight]);

  // Set global fog - with cleanup to prevent memory leaks
  useEffect(() => {
    scene.fog = new THREE.FogExp2(fogColor, 1 / (fogDistance * 1.5));
    scene.background = new THREE.Color(fogColor);

    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene, fogDistance, fogColor]);

  // Process textures - once during initial render
  useEffect(() => {
    // Skip if already processed
    if (initializedRef.current) return;

    // Grass texture setup
    grassMap.wrapS = grassMap.wrapT = THREE.RepeatWrapping;
    grassMap.repeat.set(100, 100);
    grassMap.anisotropy = 16;
    grassMap.minFilter = THREE.LinearMipmapLinearFilter;

    // If roughness map is available, configure it
    if (roughnessMap) {
      roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
      roughnessMap.repeat.set(50, 50);
    }

    // If noise map is available, configure it
    if (noiseMap) {
      noiseMap.wrapS = noiseMap.wrapT = THREE.RepeatWrapping;
      noiseMap.repeat.set(30, 30);
    }

    initializedRef.current = true;
  }, [grassMap, roughnessMap, noiseMap]);

  const sunPosition = useMemo(() => new THREE.Vector3(100, 1000, 100), []);

  // Apply terrain deformation - once during initial render
  // Apply terrain deformation - once during initial render
// Apply terrain deformation - once during initial render
useEffect(() => {
  console.log('Terrain deformation useEffect triggered');
  console.log('geometryRef.current:', geometryRef.current);

  const geom = geometryRef.current;
  if (!geom) {
    console.log('No geometry ref, exiting');
    return;
  }

  if (geom.userData.deformed) {
    console.log('Already deformed, skipping');
    return;
  }

  console.log('Deforming terrain...');
  const posAttr = geom.attributes.position;
  console.log('Vertex count:', posAttr.count);

  const vertex = new THREE.Vector3();
  let minHeight = Infinity;
  let maxHeight = -Infinity;

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    
    // FIXED: PlaneGeometry creates vertices in X-Y plane initially
    // When rotated -90° around X-axis: X stays X, Y becomes -Z, Z becomes Y
    // So for ground coordinates: use vertex.x and -vertex.y
    const worldX = vertex.x;
    const worldZ = -vertex.y; // Negative because of the rotation
    const height = getGroundHeight(worldX, worldZ);
    
    minHeight = Math.min(minHeight, height);
    maxHeight = Math.max(maxHeight, height);
    
    // The Z coordinate in geometry space becomes the height (Y in world space after rotation)
    posAttr.setXYZ(i, vertex.x, vertex.y, height);

    // Log first few vertices for debugging
    if (i < 5) {
      console.log(`Vertex ${i}: worldX=${worldX}, worldZ=${worldZ}, height=${height}`);
    }
  }

  console.log('Deformation complete. Height range:', minHeight, 'to', maxHeight);

  posAttr.needsUpdate = true;
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  console.log('Bounding box after deformation:', geom.boundingBox);

  geom.userData.deformed = true;
}, [getGroundHeight]);




  // Animate roughness variation over time
  useFrame((state) => {
    if (materialRef.current && roughnessVariation) {
      roughnessVariation.offset.x = state.clock.elapsedTime * 0.01;
      roughnessVariation.offset.y = state.clock.elapsedTime * 0.02;
      roughnessVariation.needsUpdate = true;
    }
  });

  // Memoize forest props to prevent unnecessary rerenders
  const forestProps = useMemo(() => ({
    center: [0, 0, 0],
    radius: 100,
    vegetationPositions: vegetationPositions,
    density: 0.01,
    types: ["banyan"],
    getGroundHeight,
    playerCenterRef,
    addObstacleRef
  }), [getGroundHeight, addObstacleRef]);

  return (
    <GroundHeightContext.Provider value={groundHeightContextValue}>
      {/* Sky */}
      <Sky
        distance={1000}
        sunPosition={sunPosition}
        inclination={0.6}
        azimuth={0.25}
        turbidity={10}
        rayleigh={3}
        mieCoefficient={0.005}
        mieDirectionalG={0.7}
      />

      <Mountains />

      {/* Terrain */}
      <mesh
        ref={ref}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry ref={geometryRef} args={[2048, 2048, 512, 512]} />
        <meshStandardMaterial
          ref={materialRef}
          map={grassMap}
          roughnessMap={roughnessVariation || roughnessMap}
          metalnessMap={noiseMap}
          metalness={0}
          displacementMap={noiseMap}
          normalScale={new THREE.Vector2(100, 100)}
          color={new THREE.Color(0xffffff).lerp(new THREE.Color(fogColor), 0.5)}
        />
      </mesh>

      {/* Tall Grass */}
      <Suspense fallback={null}>
        <TallGrass
          getGroundHeight={getGroundHeight}
          center={[playerCenterRef.current.x, playerCenterRef.current.y, playerCenterRef.current.z]}
        />
      </Suspense>


      {/* Lighting */}
      <directionalLight
        position={sunPosition}
        intensity={1.2}
        castShadow
        color="#bcd4e6"
      >
        <orthographicCamera attach="shadow-camera" args={[-100, 100, 100, -100, 0.1, 200]} />
      </directionalLight>

      <hemisphereLight
        args={["#1a237e", "#0d3b66", 0.2]}
        position={[0, 200, 0]}
      />

      {/* Rain Effect - memoized component */}
      <RainEffect
        count={500}
        size={0.3}
        color="#A9CCE3"
        intensity={8}
        area={300}
        center={targetPosition}
      />

      <Loot
        position={[0, getGroundHeight(0, 0) + 1, 0]}
        lootType="ammo"
        playerPosition={new THREE.Vector3(2, 3, 5)} // Your player's current position
        onPickup={() => {
          console.log("Picked up ammo!");
          // Add ammo to player, play sound, etc.
        }}
        pickupDistance={2}
      />

      {/* Forest */}
      {/* {vegetationPositions ? (
          <ForestWrapper {...forestProps} />
        ) : (
          <Suspense fallback={<div>Loading Forest Components</div>} />
        )} */}

      {/* Children can use the context via useGroundHeight */}

      <Zone />
      {children}
    </GroundHeightContext.Provider>
  );
});

// Wrap with memo to prevent unnecessary rerenders
const Ground = memo(GroundBase);

export default Ground;