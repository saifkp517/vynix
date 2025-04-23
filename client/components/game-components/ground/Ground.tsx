import { useThree, useLoader, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, forwardRef, useState } from "react";
import { Points, BufferGeometry, BufferAttribute } from 'three';
import * as THREE from "three";
import { TextureLoader } from "three";
import { Sky } from "@react-three/drei";

type GroundProps = {
  children?: (getGroundHeight: (x: number, z: number) => number) => React.ReactNode;
  fogDistance?: number;
  fogColor?: string;
};

const RainEffect = ({ count = 5000, size = 2, color = "#D6EAF8", intensity = 10, area = 100 }) => {
  const rainRef = useRef<Points>(null);

  // Create raindrops
  const raindrops = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Distribute raindrops randomly within the specified area
      positions[i * 3] = (Math.random() - 0.5) * area;      // x
      positions[i * 3 + 1] = Math.random() * 50;            // y (height)
      positions[i * 3 + 2] = (Math.random() - 0.5) * area;  // z

      // Different falling speeds for more natural effect
      velocities[i] = (Math.random() + 0.1) * intensity;
    }

    return { positions, velocities };
  }, [count, area, intensity]);

  useFrame((state, delta) => {
    if (!rainRef.current) return;

    const positions = rainRef.current.geometry.attributes.position.array;

    // Update each raindrop position
    for (let i = 0; i < count; i++) {
      // Make raindrops fall downward
      positions[i * 3 + 1] -= raindrops.velocities[i];

      // Reset position if raindrop goes below ground
      if (positions[i * 3 + 1] < -5) {
        positions[i * 3 + 1] = Math.random() * 50;
        positions[i * 3] = (Math.random() - 0.5) * area;
        positions[i * 3 + 2] = (Math.random() - 0.5) * area;
      }
    }

    rainRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={rainRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[raindrops.positions, 3]} // 3 = itemSize (x, y, z)
        />
      </bufferGeometry>
      <pointsMaterial
        attach="material"
        color={color}
        size={size}
        fog={true}
        transparent={true}
        opacity={0.6}
      />
    </points>
  );
};


const Ground = forwardRef<THREE.Mesh, GroundProps>(({
  children,
  fogDistance = 100,
  fogColor = "#B0C4DE"
}, ref) => {
  const { scene } = useThree();
  const geometryRef = useRef<THREE.PlaneGeometry>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  // Load textures
  const [grassMap, roughnessMap, noiseMap] = useLoader(TextureLoader, [
    "/textures/grass.jpg",
    "/textures/grass_rough.jpg", // You'll need to add this texture
    "/textures/grass_normal.jpg"      // You'll need to add this texture
  ]);

  // Create noise-based roughness variation
  const [roughnessVariation] = useState(() => {
    // Create a data texture for random roughness
    const size = 256;
    const data = new Uint8Array(size * size);
    for (let i = 0; i < size * size; i++) {
      data[i] = Math.floor(Math.random() * 1024);
    }
    const roughnessNoiseTexture = new THREE.DataTexture(data, size, size);
    roughnessNoiseTexture.wrapS = roughnessNoiseTexture.wrapT = THREE.RepeatWrapping;
    roughnessNoiseTexture.repeat.set(10, 10);
    roughnessNoiseTexture.needsUpdate = true;
    return roughnessNoiseTexture;
  });

  // Define height logic with added noise
  const getGroundHeight = (x: number, z: number): number => {
    const primaryFrequency = 0.1;
    const secondaryFrequency = 0.2;
    const amplitude = 1.5;
    const noiseAmplitude = 0.4;

    // Combine multiple frequencies for more natural terrain
    const baseHeight = Math.sin(x * primaryFrequency) * Math.cos(z * primaryFrequency) * amplitude;

    // Add some noise with pseudo-random value
    const noise = Math.sin(x * secondaryFrequency * 3.7) * Math.cos(z * secondaryFrequency * 2.3) * noiseAmplitude;

    return baseHeight + noise;
  };

  // Set global fog that affects everything in the scene
  useEffect(() => {
    // Use exponential fog for more realistic distance fading
    scene.fog = new THREE.FogExp2(fogColor, 1 / (fogDistance * 1.5));

    // Set background color to match fog for sky blending
    scene.background = new THREE.Color(fogColor);

    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene, fogDistance, fogColor]);

  // Process textures
  useMemo(() => {
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
  }, [grassMap, roughnessMap, noiseMap]);

  const sunPosition = useMemo(() => new THREE.Vector3(100, 10, 100), []);

  // Apply terrain deformation to the mesh
  useEffect(() => {
    const geom = geometryRef.current;
    if (!geom) return;

    const posAttr = geom.attributes.position;
    const vertex = new THREE.Vector3();
    const normal = new THREE.Vector3();

    // Add UV2 attribute for second texture coordinates
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
  }, []);

  // Animate roughness variation over time for extra randomness
  useFrame((state) => {
    if (materialRef.current) {
      // Slowly shift the roughness noise texture for subtle variation
      roughnessVariation.offset.x = state.clock.elapsedTime * 0.01;
      roughnessVariation.offset.y = state.clock.elapsedTime * 0.02;
      roughnessVariation.needsUpdate = true;
    }
  });

  return (
    <>
      {/* Sky with fog-matching background */}
      <Sky
        distance={450000}
        sunPosition={sunPosition}
        inclination={0.6}
        azimuth={0.25}
        turbidity={10}
        rayleigh={3}
        mieCoefficient={0.005}
        mieDirectionalG={0.7}
      />

      {/* Deformed Terrain */}
      <mesh
        ref={ref}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.1, 0]}
        receiveShadow
      >
        <planeGeometry ref={geometryRef} args={[2000, 2000, 128, 128]} />
        <meshStandardMaterial
          ref={materialRef}
          map={grassMap}

          // Use the noise texture as roughness map or fallback to the roughness texture
          roughnessMap={roughnessVariation || roughnessMap}
          roughness={0.9}

          // Add random roughness metalnessMap
          metalnessMap={noiseMap}
          metalness={0.05}

          // Add displacement for micro-detail
          displacementMap={noiseMap}
          displacementScale={0.8}

          // Use noise for normal variation
          normalScale={new THREE.Vector2(1.0, 1.0)}

          // Adjust color to blend with fog at distance
          color={new THREE.Color(0xffffff).lerp(new THREE.Color(fogColor), 0.1)}
        />
      </mesh>

      {/* Lighting adjusted to match fog atmosphere */}
      <ambientLight intensity={0.4} color="#D6EAF8" />
      <directionalLight position={sunPosition} intensity={1.5} castShadow color="#FFFAF0">
        <orthographicCamera attach="shadow-camera" args={[-100, 100, 100, -100, 0.1, 200]} />
      </directionalLight>
      <hemisphereLight args={["#B3E5FC", "#C5E1A5", 0.3]} position={[0, 50, 0]} />

      {/* Add Rain Effect */}
      <RainEffect
        count={800}
        size={0.3}
        color="#A9CCE3"
        intensity={1.2}
        area={200}
      />

      {/* Fog effect - adjust as needed with rain */}
      <fog attach="fog" args={["#D6EAF8", 30, 100]} />

      {/* Children like Player/Obstacles get access to height */}
      {children?.(getGroundHeight)}
    </>
  );
});

export default Ground;