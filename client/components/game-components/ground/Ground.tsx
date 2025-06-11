import { useThree, useLoader, useFrame } from "@react-three/fiber";
import { createNoise2D } from 'simplex-noise';
import React, { Suspense, createContext, useContext, memo } from "react";
import { useEffect, useMemo, useRef, forwardRef, useState } from "react";
import * as THREE from "three";
import { TextureLoader } from "three";
import socket from "@/lib/socket";
import { Forest } from "../forest/ForestGenerator";
import { Sky } from "@react-three/drei";
import { Mountains } from "../elements/Mountains";
import { RainEffect } from "../elements/Rain";
import TallGrass from "../elements/Grass";
import Loot from "../player/Loot";
import { ComponentLoadingTracker } from "@/components/class/ComponentLoadingTracker";
import type { Vegetation } from "@/app/types/types";


// Global logger instance
const logger = ComponentLoadingTracker.getInstance();

// Enhanced logging hook
const useComponentLogger = (componentName: string) => {
  useEffect(() => {
    logger.logStatus(componentName, 'loading');

    return () => {
      logger.logStatus(componentName, 'unloaded');
    };
  }, [componentName]);

  const markLoaded = () => logger.logStatus(componentName, 'loaded');
  const markFailed = (error?: Error) => logger.logStatus(componentName, 'failed', error);

  return { markLoaded, markFailed };
};

// Loading Fallback Component
const LoadingFallback: React.FC<{ componentName: string }> = ({ componentName }) => {
  useEffect(() => {
    logger.logStatus(`${componentName} (Fallback)`, 'loading');
    return () => logger.logStatus(`${componentName} (Fallback)`, 'unloaded');
  }, [componentName]);

  return null; // Invisible fallback
};

// Error Boundary for catching component failures
class ComponentErrorBoundary extends React.Component<
  { children: React.ReactNode; componentName: string },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; componentName: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.logStatus(this.props.componentName, 'failed', error);
    console.error(`Component ${this.props.componentName} failed:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return null; // Render nothing on error
    }

    return this.props.children;
  }
}

// Ground Height Context
type GroundHeightContextType = {
  getGroundHeight: (x: number, z: number) => number;
};

interface TreePosition {
  position: [number, number, number];
  rotation: number;
  scale: number;
}

const GroundHeightContext = createContext<GroundHeightContextType | null>(null);

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
  vegetationPositions?: Vegetation[];
  fogColor?: string;
  addObstacleRef: (ref: THREE.Mesh | null) => void;
  onAllComponentsLoaded?: () => void;
  onComponentStatusChange?: (componentName: string, status: 'loading' | 'loaded' | 'failed' | 'unloaded', details?: { loadTime?: number; error?: string }) => void;
};

// Enhanced ForestWrapper with logging
const ForestWrapper = memo(({ center, radius, density, getGroundHeight, addObstacleRef, vegetationPositions }: any) => {
  const { markLoaded, markFailed } = useComponentLogger('ForestWrapper');

  useEffect(() => {
    try {
      // Simulate component initialization
      setTimeout(() => markLoaded(), 100);
    } catch (error) {
      markFailed(error as Error);
    }
  }, [markLoaded, markFailed]);

  return (
    <ComponentErrorBoundary componentName="Forest">
      <Forest
        vegetationPositions={vegetationPositions}
        addObstacleRef={addObstacleRef}
        getGroundHeight={getGroundHeight}
      />
    </ComponentErrorBoundary>
  );
});

// Enhanced component wrappers
const EnhancedTallGrass = memo((props: any) => {
  const { markLoaded, markFailed } = useComponentLogger('TallGrass');

  useEffect(() => {
    try {
      setTimeout(() => markLoaded(), 50);
    } catch (error) {
      markFailed(error as Error);
    }
  }, [markLoaded, markFailed]);

  return (
    <ComponentErrorBoundary componentName="TallGrass">
      <TallGrass {...props} />
    </ComponentErrorBoundary>
  );
});

const EnhancedMountains = memo(() => {
  const { markLoaded, markFailed } = useComponentLogger('Mountains');

  useEffect(() => {
    try {
      setTimeout(() => markLoaded(), 30);
    } catch (error) {
      markFailed(error as Error);
    }
  }, [markLoaded, markFailed]);

  return (
    <ComponentErrorBoundary componentName="Mountains">
      <Mountains />
    </ComponentErrorBoundary>
  );
});

const EnhancedSky = memo((props: any) => {
  const { markLoaded, markFailed } = useComponentLogger('Sky');

  useEffect(() => {
    try {
      setTimeout(() => markLoaded(), 20);
    } catch (error) {
      markFailed(error as Error);
    }
  }, [markLoaded, markFailed]);

  return (
    <ComponentErrorBoundary componentName="Sky">
      <Sky {...props} />
    </ComponentErrorBoundary>
  );
});

const EnhancedRainEffect = memo((props: any) => {
  const { markLoaded, markFailed } = useComponentLogger('RainEffect');

  useEffect(() => {
    try {
      setTimeout(() => markLoaded(), 40);
    } catch (error) {
      markFailed(error as Error);
    }
  }, [markLoaded, markFailed]);

  return (
    <ComponentErrorBoundary componentName="RainEffect">
      <RainEffect {...props} />
    </ComponentErrorBoundary>
  );
});

const EnhancedLoot = memo((props: any) => {
  const { markLoaded, markFailed } = useComponentLogger('Loot');

  useEffect(() => {
    try {
      setTimeout(() => markLoaded(), 10);
    } catch (error) {
      markFailed(error as Error);
    }
  }, [markLoaded, markFailed]);

  return (
    <ComponentErrorBoundary componentName="Loot">
      <Loot {...props} />
    </ComponentErrorBoundary>
  );
});

// Main Ground component implementation
const GroundBase = forwardRef<THREE.Mesh, GroundProps>(({
  children,
  fogDistance = 15,
  vegetationPositions,
  fogColor = "#A8B8D0",
  addObstacleRef,
  playerCenterRef,
  onAllComponentsLoaded,
  onComponentStatusChange
}, ref) => {

  const componentsToTrack = [
    'Ground',
    'Textures',
    'Socket Connection',
    'Roughness Texture Generation',
    'Ground Height Function',
    'Scene Fog',
    'Texture Processing',
    'Terrain Deformation',
    'Sky',
    'Mountains',
    'RainEffect',
    'Loot',
    'Forest', // Uncomment if ForestWrapper is used
    'TallGrass' // Uncomment if TallGrass is used
  ];

  const statusChangeListenerId = useRef(`status-${Math.random().toString(36).slice(2)}`).current;
  const allLoadedListenerId = useRef(`all-loaded-${Math.random().toString(36).slice(2)}`).current;

  // Notify parent of component status changes
  useEffect(() => {
    if (!onComponentStatusChange) return;

    const handleStatusChange = (
      componentName: string,
      status: 'loading' | 'loaded' | 'failed' | 'unloaded',
      details: { loadTime?: number; error?: string }
    ) => {
      onComponentStatusChange(componentName, status, details);
    };

    logger.onStatusChange(statusChangeListenerId, handleStatusChange);

    return () => {
      logger.offStatusChange(statusChangeListenerId);
    };
  }, [onComponentStatusChange]);

  // Notify parent when all components are loaded
  useEffect(() => {
    if (!onAllComponentsLoaded) return;

    const checkAllLoaded = () => {
      const allLoaded = componentsToTrack.every((componentName) => {
        const status = logger.getComponentStatus(componentName);
        return status?.status === 'loaded';
      });

      if (allLoaded) {
        logger.logStatus('Ground Components', 'loaded');
        onAllComponentsLoaded();
      }
    };

    logger.onStatusChange(allLoadedListenerId, checkAllLoaded);

    return () => {
      logger.offStatusChange(allLoadedListenerId);
    };
  }, [onAllComponentsLoaded]);



  const { scene } = useThree();
  const geometryRef = useRef<THREE.PlaneGeometry>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const [targetPosition, setTargetPosition] = useState([0, 0, 0]);
  const initializedRef = useRef(false);

  // Main component logging
  const { markLoaded } = useComponentLogger('Ground');

  // Texture loading with logging
  const [grassMap, roughnessMap, noiseMap] = useLoader(TextureLoader, [
    "/textures/grass.jpg",
    "/textures/grass_rough.jpg",
    "/textures/grass_normal.jpg"
  ]);

  // Log texture loading
  useEffect(() => {
    if (grassMap && roughnessMap && noiseMap && geometryRef.current) {
      const groundStatus = logger.getComponentStatus('Ground');
      if (groundStatus?.status !== 'loaded') {
        markLoaded();
      }
    }
  }, [grassMap, roughnessMap, noiseMap, markLoaded]);

  // Socket setup with logging
  useEffect(() => {
    logger.logStatus('Socket Connection', 'loading');

    socket.on('updateForest', ({ id, position }) => {
      setTargetPosition([position.x, position.y, position.z]);
      logger.logStatus('Socket Connection', 'loaded');
    });

    return () => {
      socket.off("updateForest", ({ id, position }: any) => {
        setTargetPosition([position.x, position.y, position.z]);
      });
      logger.logStatus('Socket Connection', 'unloaded');
    };
  }, []);

  // Roughness variation with logging
  const roughnessVariation = useMemo(() => {
    logger.logStatus('Roughness Texture Generation', 'loading');

    try {
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

      logger.logStatus('Roughness Texture Generation', 'loaded');
      return texture;
    } catch (error) {
      logger.logStatus('Roughness Texture Generation', 'failed', error as Error);
      return null;
    }
  }, []);

  // Ground height function with logging
  const SEED = 12345;
  const getGroundHeight = useMemo(() => {
    logger.logStatus('Ground Height Function', 'loading');

    try {
      const noise2D = createNoise2D(() => SEED);

      const heightFunction = (x: number, z: number): number => {
        const primaryFrequency = 0.005;
        const secondaryFrequency = 0.01;
        const amplitude = 25;
        const noiseAmplitude = 3;

        const baseHeight = noise2D(x * primaryFrequency, z * primaryFrequency) * amplitude;
        const noise = noise2D(x * secondaryFrequency * 3.7, z * secondaryFrequency * 2.3) * noiseAmplitude;

        return baseHeight + noise;
      };

      logger.logStatus('Ground Height Function', 'loaded');
      return heightFunction;
    } catch (error) {
      logger.logStatus('Ground Height Function', 'failed', error as Error);
      return (x: number, z: number) => 0; // Fallback function
    }
  }, []);

  const groundHeightContextValue = useMemo(() => ({
    getGroundHeight
  }), [getGroundHeight]);

  // Fog setup with logging
  useEffect(() => {
    logger.logStatus('Scene Fog', 'loading');

    try {
      scene.fog = new THREE.FogExp2(fogColor, 1 / (fogDistance * 1.5));
      scene.background = new THREE.Color(fogColor);
      logger.logStatus('Scene Fog', 'loaded');
    } catch (error) {
      logger.logStatus('Scene Fog', 'failed', error as Error);
    }

    return () => {
      scene.fog = null;
      scene.background = null;
      logger.logStatus('Scene Fog', 'unloaded');
    };
  }, [scene, fogDistance, fogColor]);

  // Texture processing with logging
  useEffect(() => {
    if (initializedRef.current) return;

    logger.logStatus('Texture Processing', 'loading');

    try {
      grassMap.wrapS = grassMap.wrapT = THREE.RepeatWrapping;
      grassMap.repeat.set(100, 100);
      grassMap.anisotropy = 16;
      grassMap.minFilter = THREE.LinearMipmapLinearFilter;

      if (roughnessMap) {
        roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
        roughnessMap.repeat.set(50, 50);
      }

      if (noiseMap) {
        noiseMap.wrapS = noiseMap.wrapT = THREE.RepeatWrapping;
        noiseMap.repeat.set(30, 30);
      }

      initializedRef.current = true;
      logger.logStatus('Texture Processing', 'loaded');
    } catch (error) {
      logger.logStatus('Texture Processing', 'failed', error as Error);
    }
  }, [grassMap, roughnessMap, noiseMap]);

  const sunPosition = useMemo(() => new THREE.Vector3(100, 1000, 100), []);

  // Terrain deformation with logging
  useEffect(() => {
    logger.logStatus('Terrain Deformation', 'loading');

    const geom = geometryRef.current;
    if (!geom) {
      logger.logStatus('Terrain Deformation', 'failed', new Error('No geometry ref'));
      return;
    }

    if (geom.userData.deformed) {
      logger.logStatus('Terrain Deformation', 'loaded');
      return;
    }

    try {
      const posAttr = geom.attributes.position;
      const vertex = new THREE.Vector3();
      let minHeight = Infinity;
      let maxHeight = -Infinity;

      for (let i = 0; i < posAttr.count; i++) {
        vertex.fromBufferAttribute(posAttr, i);

        const worldX = vertex.x;
        const worldZ = -vertex.y;
        const height = getGroundHeight(worldX, worldZ);

        minHeight = Math.min(minHeight, height);
        maxHeight = Math.max(maxHeight, height);

        posAttr.setXYZ(i, vertex.x, vertex.y, height);
      }

      posAttr.needsUpdate = true;
      geom.computeVertexNormals();
      geom.computeBoundingBox();
      geom.userData.deformed = true;

      logger.logStatus('Terrain Deformation', 'loaded');
      console.log(`Terrain deformed with height range: ${minHeight} to ${maxHeight}`);
    } catch (error) {
      logger.logStatus('Terrain Deformation', 'failed', error as Error);
    }
  }, [getGroundHeight]);

  // Animation frame with logging
  useFrame((state) => {
    if (materialRef.current && roughnessVariation) {
      roughnessVariation.offset.x = state.clock.elapsedTime * 0.01;
      roughnessVariation.offset.y = state.clock.elapsedTime * 0.02;
      roughnessVariation.needsUpdate = true;
    }
  });

  // Forest props
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

  // Mark ground component as loaded when everything is ready
  useEffect(() => {
    if (grassMap && roughnessMap && noiseMap && geometryRef.current) {
      markLoaded();
    }
  }, [grassMap, roughnessMap, noiseMap, markLoaded]);

  return (
    <GroundHeightContext.Provider value={groundHeightContextValue}>
      {/* Enhanced Sky */}
      <EnhancedSky
        distance={1000}
        sunPosition={sunPosition}
        inclination={0.6}
        azimuth={0.25}
        turbidity={10}
        rayleigh={3}
        mieCoefficient={0.005}
        mieDirectionalG={0.7}
      />

      <EnhancedMountains />

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

      {/* Enhanced Tall Grass */}
      {/* <Suspense fallback={<LoadingFallback componentName="TallGrass" />}>
        <EnhancedTallGrass
          getGroundHeight={getGroundHeight}
          playerCenterRef={playerCenterRef}
        />
      </Suspense> */}

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

      {/* Enhanced Rain Effect */}
      <EnhancedRainEffect
        count={500}
        size={0.3}
        color="#A9CCE3"
        intensity={8}
        area={300}
        center={targetPosition}
      />

      <EnhancedLoot
        position={[0, getGroundHeight(0, 0) + 1, 0]}
        lootType="ammo"
        playerPosition={new THREE.Vector3(2, 3, 5)}
        onPickup={() => {
          console.log("Picked up ammo!");
        }}
        pickupDistance={2}
      />

      {/* Enhanced Forest */}
      {/* {vegetationPositions ? (
        <Suspense fallback={<LoadingFallback componentName="Forest" />}>
          <ForestWrapper {...forestProps} />
        </Suspense>
      ) : (
        <LoadingFallback componentName="Forest (No Vegetation)" />
      )} */}

      {children}
    </GroundHeightContext.Provider>
  );
});

const Ground = memo(GroundBase);

// Export the logger for external access
export { logger as ComponentLogger };
export default Ground;