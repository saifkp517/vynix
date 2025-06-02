import { useRef, useMemo, memo } from "react";
import { Points, BufferGeometry, BufferAttribute, ShaderMaterial } from "three";
import { useFrame } from "@react-three/fiber";

export const RainEffect = memo(
  ({
    count = 3000,
    size = 0.5,
    color = "#87CEEB",
    intensity = 15,
    area = 120,
    center = [0, 50, 0],
    wind = 0.5
  }: any) => {
    const rainRef = useRef<Points>(null);
    
    // Custom shader material for rain streaks
    const rainMaterial = useMemo(() => {
      return new ShaderMaterial({
        transparent: true,
        vertexShader: `
          attribute float velocity;
          attribute float opacity;
          varying float vOpacity;
          varying vec3 vPosition;
          
          void main() {
            vOpacity = opacity;
            vPosition = position;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = 3.0 * (300.0 / -mvPosition.z);
          }
        `,
        fragmentShader: `
          varying float vOpacity;
          varying vec3 vPosition;
          
          void main() {
            // Create streak-like appearance
            vec2 uv = gl_PointCoord - 0.5;
            float dist = length(uv);
            
            // Vertical streak pattern
            float streak = 1.0 - abs(uv.x * 4.0);
            streak = max(0.0, streak);
            
            // Fade based on distance and create droplet shape
            float alpha = (1.0 - dist * 2.0) * streak * vOpacity;
            alpha = max(0.0, alpha);
            
            // Blue-white rain color with slight variation
            vec3 rainColor = mix(vec3(0.4, 0.6, 0.9), vec3(0.8, 0.9, 1.0), alpha);
            
            gl_FragColor = vec4(rainColor, alpha * 0.6);
          }
        `,
        uniforms: {}
      });
    }, []);

    // Create raindrops with more realistic properties
    const raindrops = useMemo(() => {
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count);
      const opacities = new Float32Array(count);

      const rainFallHeight = 120;

      for (let i = 0; i < count; i++) {
        // Spread rain across area
        positions[i * 3] = (Math.random() - 0.5) * area + center[0];
        positions[i * 3 + 1] = Math.random() * rainFallHeight + center[1];
        positions[i * 3 + 2] = (Math.random() - 0.5) * area + center[2];
        
        // Varied velocities for more natural look
        velocities[i] = (Math.random() * 0.5 + 0.8) * intensity;
        
        // Varied opacity for depth
        opacities[i] = Math.random() * 0.8 + 0.2;
      }

      return { 
        positions, 
        velocities, 
        opacities,
        geometry: (() => {
          const geometry = new BufferGeometry();
          geometry.setAttribute('position', new BufferAttribute(positions, 3));
          geometry.setAttribute('velocity', new BufferAttribute(velocities, 1));
          geometry.setAttribute('opacity', new BufferAttribute(opacities, 1));
          return geometry;
        })()
      };
    }, [count, area, intensity, center]);

    useFrame((state, delta) => {
      if (!rainRef.current) return;

      const positions = rainRef.current.geometry.attributes.position.array;
      const time = state.clock.elapsedTime;

      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        
        // Apply gravity (downward movement)
        positions[idx + 1] -= raindrops.velocities[i] * delta * 60;
        
        // Apply subtle wind effect
        positions[idx] += Math.sin(time * 0.5 + i * 0.1) * wind * delta;
        
        // Reset raindrop when it goes below ground
        if (positions[idx + 1] < center[1] - 60) {
          positions[idx] = (Math.random() - 0.5) * area + center[0];
          positions[idx + 1] = center[1] + 60 + Math.random() * 20;
          positions[idx + 2] = (Math.random() - 0.5) * area + center[2];
        }
      }

      rainRef.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
      <points 
        ref={rainRef} 
        geometry={raindrops.geometry}
        material={rainMaterial}
        frustumCulled={false}
      />
    );
  }
);
    