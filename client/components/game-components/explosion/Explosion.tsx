import React, { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';

// Particle for explosion fragments
const ExplosionParticle = ({ 
  position, 
  scale, 
  color, 
  speed, 
  direction, 
  lifespan,
}: { 
  position: THREE.Vector3, 
  scale: number, 
  color: string, 
  speed: number, 
  direction: THREE.Vector3,
  lifespan: number
}) => {
  const ref = useRef<THREE.Mesh>(null);
  const [opacity, setOpacity] = useState(1);
  const startTime = useRef(Date.now());
  
  useFrame(() => {
    if (!ref.current) return;
    
    // Move particle
    ref.current.position.add(direction.clone().multiplyScalar(speed));
    
    // Calculate life percentage
    const elapsed = (Date.now() - startTime.current) / 1000;
    const lifePercentage = Math.min(elapsed / lifespan, 1);
    
    // Fade out over time
    setOpacity(1 - lifePercentage);
    
    // Apply some drag to slow particles
    speed *= 0.95;
  });
  
  return (
    <mesh ref={ref} position={position} scale={scale}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshStandardMaterial 
        color={color} 
        emissive={color} 
        emissiveIntensity={2} 
        opacity={opacity} 
      />
    </mesh>
  );
};

const Explosion: React.FC<{ position: THREE.Vector3, explosionRadius: number }> = ({ position, explosionRadius = 15 }) => {
  const lightRef = useRef<THREE.PointLight>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const shockwaveRef = useRef<THREE.Mesh>(null);
  const smokeRingRef = useRef<THREE.Mesh>(null);
  
  const [lightIntensity, setLightIntensity] = useState(15);
  const explosionStartTime = useRef(Date.now());
  const explosionDuration = 2.5; // seconds
  
  // Handle explosion animation
  useFrame(() => {
    if (!lightRef.current || !coreRef.current || !shockwaveRef.current || !smokeRingRef.current) return;
    
    const elapsed = (Date.now() - explosionStartTime.current) / 1000;
    const lifePercentage = Math.min(elapsed / explosionDuration, 1);
    
    // Core explosion animation
    const coreScale = 1 + lifePercentage * 0.5; // Core slightly expands
    coreRef.current.scale.set(coreScale, coreScale, coreScale);
    
    // Material updates
    const coreMaterial = coreRef.current.material as THREE.MeshStandardMaterial;
    coreMaterial.opacity = Math.max(0, 1 - lifePercentage * 1.2);
    coreMaterial.emissiveIntensity = 3 * (1 - lifePercentage);
    
    // Shockwave animation
    const shockwaveSize = Math.min(1, elapsed * 2) * explosionRadius * 1.5;
    const shockwaveMaterial = shockwaveRef.current.material as THREE.MeshBasicMaterial;
    shockwaveRef.current.scale.set(shockwaveSize, shockwaveSize, shockwaveSize);
    shockwaveMaterial.opacity = Math.max(0, 0.8 - lifePercentage * 1.2);
    
    // Smoke ring animation
    const smokeRingSize = 1 + lifePercentage * 3;
    smokeRingRef.current.scale.set(smokeRingSize, smokeRingSize, smokeRingSize);
    const smokeRingMaterial = smokeRingRef.current.material as THREE.MeshBasicMaterial;
    smokeRingMaterial.opacity = Math.max(0, 0.7 - lifePercentage);
    
    // Fade out light intensity with a pulse effect
    const pulseEffect = Math.max(0, 1 - (elapsed / 0.3)) * Math.sin(elapsed * 10) * 0.2;
    setLightIntensity(15 * (1 - lifePercentage) + pulseEffect);
  });

  return (
    <group>
      {/* Enhanced core explosion */}
      <mesh 
        ref={coreRef} 
        position={position}
      >
        <sphereGeometry args={[explosionRadius * 0.6, 32, 32]} />
        <meshStandardMaterial 
          color="#ff3300" 
          emissive="#ff7700"
          emissiveIntensity={3}
          transparent
          opacity={1}
          roughness={0.4}
          metalness={0.6}
        />
      </mesh>
      
      {/* Secondary inner glow */}
      <mesh position={position}>
        <sphereGeometry args={[explosionRadius * 0.4, 24, 24]} />
        <meshStandardMaterial 
          color="#ffdd00" 
          emissive="#ffff00"
          emissiveIntensity={5}
          transparent
          opacity={Math.max(0, 1 - (Date.now() - explosionStartTime.current) / 1000 / (explosionDuration * 0.7))}
        />
      </mesh>
      
      {/* Improved explosion light with color transition */}
      <pointLight 
        ref={lightRef}
        position={position} 
        color={new THREE.Color(1.0, 0.5, 0.2)} 
        intensity={lightIntensity} 
        distance={explosionRadius * 3}
        decay={1.5} 
      />
      
      {/* Secondary light source */}
      <pointLight 
        position={position} 
        color={new THREE.Color(1.0, 0.8, 0.4)} 
        intensity={lightIntensity * 0.5} 
        distance={explosionRadius * 2}
        decay={2} 
      />
      
      {/* Improved smoke ring */}
      <Billboard position={position}>
        <mesh ref={smokeRingRef}>
          <ringGeometry args={[explosionRadius * 0.5, explosionRadius * 1.2, 64]} />
          <meshBasicMaterial 
            color="#444444" 
            transparent 
            opacity={0.7}
            side={THREE.DoubleSide}
          />
        </mesh>
      </Billboard>
      
      {/* Enhanced shockwave */}
      <Billboard position={position}>
        <mesh ref={shockwaveRef}>
          <ringGeometry args={[0, explosionRadius, 64]} />
          <meshBasicMaterial 
            color="#ffaa77" 
            transparent 
            opacity={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
      </Billboard>
      
      {/* Hot center flare */}
      <Billboard position={position}>
        <mesh>
          <planeGeometry args={[explosionRadius * 1.5, explosionRadius * 1.5]} />
          <meshBasicMaterial 
            color="#ffffff" 
            transparent 
            opacity={Math.max(0, 0.9 - (Date.now() - explosionStartTime.current) / 1000 / (explosionDuration * 0.3))}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </Billboard>
    </group>
  );
};

export default Explosion;