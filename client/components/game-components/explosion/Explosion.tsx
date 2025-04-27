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
        transparent 
        opacity={opacity} 
      />
    </mesh>
  );
};

const Explosion: React.FC<{ position: THREE.Vector3, explosionRadius: number }> = ({ position, explosionRadius = 15 }) => {
  const [particles, setParticles] = useState<React.ReactNode[]>([]);
  const lightRef = useRef<THREE.PointLight>(null);
  const [lightIntensity, setLightIntensity] = useState(10);
  const explosionStartTime = useRef(Date.now());
  const explosionDuration = 2; // seconds
  
  // Generate particles on mount
  useEffect(() => {
    const newParticles = [];
    const particleCount = 30;
    const colors = ['#ff7700', '#ff5500', '#ff3300', '#ffcc00', '#ff9900'];
    
    for (let i = 0; i < particleCount; i++) {
      // Random direction
      const direction = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      ).normalize();
      
      // Random properties
      const speed = 0.05 + Math.random() * 0.2;
      const scale = 0.2 + Math.random() * 0.8;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const lifespan = 0.8 + Math.random() * 1.2;
      
      newParticles.push(
        <ExplosionParticle 
          key={i}
          position={position.clone()}
          scale={scale}
          color={color}
          speed={speed}
          direction={direction}
          lifespan={lifespan}
        />
      );
    }
    
    setParticles(newParticles);
  }, [position]);
  
  // Handle explosion light and core fading
  useFrame(() => {
    if (!lightRef.current) return;
    
    const elapsed = (Date.now() - explosionStartTime.current) / 1000;
    const lifePercentage = Math.min(elapsed / explosionDuration, 1);
    
    // Fade out light intensity
    setLightIntensity(10 * (1 - lifePercentage));
  });
  
  return (
    <group>
      {/* Core explosion */}
      <mesh position={position}>
        <sphereGeometry args={[explosionRadius, 16, explosionRadius]} />
        <meshStandardMaterial 
          color="#ff5500" 
          emissive="#ff1300"
          emissiveIntensity={2}
          opacity={Math.max(0, 1 - (Date.now() - explosionStartTime.current) / 1000 / explosionDuration)}
        />
      </mesh>
      
      {/* Explosion light */}
      <pointLight 
        ref={lightRef}
        position={position} 
        color="#ff7700" 
        intensity={lightIntensity} 
        distance={10} 
        decay={2} 
      />
      
      {/* Smoke ring */}
      <Billboard position={position}>
        <mesh>
          <ringGeometry args={[0.5, 3, 32]} />
          <meshBasicMaterial 
            color="#555555" 
            transparent 
            opacity={Math.max(0, 0.5 - (Date.now() - explosionStartTime.current) / 1000 / explosionDuration)}
            side={THREE.DoubleSide}
          />
        </mesh>
      </Billboard>
      
      {/* Particles */}
      {particles}
      
      {/* Shockwave */}
      <Billboard position={position}>
        <mesh>
          <ringGeometry args={[0, 3 * Math.min(1, (Date.now() - explosionStartTime.current) / 500), 32]} />
          <meshBasicMaterial 
            color="#ffaa77" 
            transparent 
            opacity={Math.max(0, 0.7 - (Date.now() - explosionStartTime.current) / 1000 / (explosionDuration * 0.5))}
            side={THREE.DoubleSide}
          />
        </mesh>
      </Billboard>
    </group>
  );
};

export default Explosion;