import { useThree, useLoader, useFrame } from "@react-three/fiber";
import { createNoise2D } from 'simplex-noise';
import React, { Suspense, createContext, useContext, memo } from "react";
import { useEffect, useMemo, useRef, forwardRef, useState } from "react";
import { Points } from 'three';
import * as THREE from "three";
import { TextureLoader } from "three";
import socket from "@/lib/socket";
import { Forest } from "../forest/ForestGenerator";
import { Sky } from "@react-three/drei";
import { Mountains } from "../obstacles/Mountains";
import TallGrass from "../obstacles/Grass";
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
  fogDistance?: number;
  vegetationPositions?: Vegetation[],
  fogColor?: string;
  addObstacleRef: (ref: THREE.Mesh | null) => void;
};

// TallGrass component to add grass blades to the scene


// RainEffect component is memoized to prevent unnecessary rerenders
const RainEffect = memo(
  ({
    count = 5000,
    size = 2,
    color = "#D6EAF8",
    intensity = 10,
    area = 100,
    center
  }: any) => {
    const rainRef = useRef<Points>(null);
    console.log("RainEffect rendered");
    // Create raindrops - memoized so it's not recreated on rerenders
    const raindrops = useMemo(() => {
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count);

      const rainFallHeight = 100;

      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * area + center[0];
        positions[i * 3 + 1] = Math.random() * rainFallHeight + center[1];
        positions[i * 3 + 2] = (Math.random() - 0.5) * area + center[2];
        velocities[i] = (Math.random() + 0.1) * intensity;
      }

      return { positions, velocities };
    }, [count, area, intensity]);

    useFrame((state, delta) => {
      if (!rainRef.current) return;

      const positions = rainRef.current.geometry.attributes.position.array;

      for (let i = 0; i < count; i++) {
        positions[i * 3 + 1] -= raindrops.velocities[i];

        if (positions[i * 3 + 1] < -5) {
          positions[i * 3] = (Math.random() - 0.5) * area + center[0];
          positions[i * 3 + 1] = Math.random() * 100 + center[1];
          positions[i * 3 + 2] = (Math.random() - 0.5) * area + center[2];
        }
      }

      rainRef.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
      <points ref={rainRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[raindrops.positions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          attach="material"
          color={color}
          size={size}
          fog={true}
          transparent={true}
        />
      </points>
    );
  }
);

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
  fogDistance = 100,
  vegetationPositions,
  fogColor = "#B0C4DE",
  addObstacleRef
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

  // Define height logic - memoized so it's stable across renders
  const getGroundHeight = useMemo(() => {
    return (x: number, z: number): number => {
      const primaryFrequency = 0.01; // controls the frequency of hills
      // Higher frequency = more hills, lower frequency = larger hills
      const secondaryFrequency = 0.2;
      const amplitude = 50; // increases height of hills
      const noiseAmplitude = 0.2; // increases noise variation

      const baseHeight = Math.sin(x * primaryFrequency) * Math.cos(z * primaryFrequency) * amplitude;
      const noise = Math.sin(x * secondaryFrequency * 3.7) * Math.cos(z * secondaryFrequency * 2.3) * noiseAmplitude;

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
  useEffect(() => {
    const geom = geometryRef.current;
    if (!geom) return;

    // Skip if already deformed
    if (geom.userData.deformed) return;

    const posAttr = geom.attributes.position;
    const vertex = new THREE.Vector3();
    const uv2 = new Float32Array(posAttr.count * 2);

    for (let i = 0; i < posAttr.count; i++) {
      vertex.fromBufferAttribute(posAttr, i);

      // Since the plane is rotated, X and Y are horizontal, Z is height
      const height = getGroundHeight(vertex.x, vertex.y);
      vertex.setZ(height);

      // Set varied UV2 coordinates for detail maps
      uv2[i * 2] = vertex.x * 0.05;
      uv2[i * 2 + 1] = vertex.y * 0.05;

      posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    // Add second UV set for detail textures
    geom.setAttribute('uv2', new THREE.BufferAttribute(uv2, 2));

    posAttr.needsUpdate = true;
    geom.computeVertexNormals();

    // Mark as deformed so we don't repeat this process
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
        position={[0, -0.1, 0]}
        receiveShadow
      >
        <planeGeometry ref={geometryRef} args={[2048, 2048, 512, 512]} />
        <meshStandardMaterial
          ref={materialRef}
          map={grassMap}
          roughnessMap={roughnessVariation || roughnessMap}
          roughness={6}
          metalnessMap={noiseMap}
          metalness={0.05}
          displacementMap={noiseMap}
          displacementScale={0.8}
          normalScale={new THREE.Vector2(10.0, 10.0)}
          color={new THREE.Color(0xffffff).lerp(new THREE.Color(fogColor), 0.5)}
        />
      </mesh>

      {/* Tall Grass */}
      <Suspense fallback={null}>
        <TallGrass
          getGroundHeight={getGroundHeight}
          center={[targetPosition[0], targetPosition[1], targetPosition[2]]}
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
        count={600}
        size={0.3}
        color="#A9CCE3"
        intensity={1.2}
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
      {vegetationPositions ? (
        <ForestWrapper {...forestProps} />
      ) : (
        <Suspense  />
      )}

      {/* Children can use the context via useGroundHeight */}
      {children}
    </GroundHeightContext.Provider>
  );
});

// Wrap with memo to prevent unnecessary rerenders
const Ground = memo(GroundBase);

export default Ground;