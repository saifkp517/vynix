import React, { useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

interface LootProps {
    position: [number, number, number];
    lootType?: 'ammo' | 'health' | 'weapon' | 'armor';
    onPickup?: () => void;
    pickupDistance?: number;
    playerPosition?: THREE.Vector3;
}

const Loot: React.FC<LootProps> = ({ 
    position, 
    lootType = 'ammo',
    onPickup,
    pickupDistance = 2,
    playerPosition 
}) => {
    const lootRef = useRef<THREE.Group>(null);
    const [isPickedUp, setIsPickedUp] = useState(false);
    
    // Colors for different loot types
    const lootColors = {
        ammo: '#ffdd00',     // Yellow
        health: '#ff4444',   // Red
        weapon: '#44ff44',   // Green
        armor: '#4444ff'     // Blue
    };

    // Floating animation and pickup detection
    useFrame((state) => {
        if (!lootRef.current || isPickedUp) return;
        
        const time = state.clock.elapsedTime;
        
        // Floating animation
        lootRef.current.position.y = position[1] + Math.sin(time * 2) * 0.1;
        
        // Spinning animation
        lootRef.current.rotation.y = time;
        
        // Check if player is close enough to pick up
        if (playerPosition && onPickup) {
            const lootWorldPos = new THREE.Vector3();
            lootRef.current.getWorldPosition(lootWorldPos);
            
            const distance = playerPosition.distanceTo(lootWorldPos);
            
            if (distance <= pickupDistance) {
                setIsPickedUp(true);
                onPickup();
            }
        }
    });

    if (isPickedUp) return null;

    return (
        <group ref={lootRef} position={position}>
            {/* Main loot object */}
            <mesh>
                <boxGeometry args={[0.3, 0.3, 0.3]} />
                <meshStandardMaterial 
                    color={lootColors[lootType]}
                    emissive={lootColors[lootType]}
                    emissiveIntensity={0.3}
                />
            </mesh>
            
            {/* Outer glow effect */}
            <mesh>
                <boxGeometry args={[0.4, 0.4, 0.4]} />
                <meshBasicMaterial 
                    color={lootColors[lootType]}
                    transparent
                    opacity={0.2}
                />
            </mesh>
            
            {/* Glowing light */}
            <pointLight 
                color={lootColors[lootType]}
                intensity={1}
                distance={5}
                decay={2}
            />
            
            {/* Optional: Pickup indicator when player is nearby */}
            {playerPosition && lootRef.current && (() => {
                const lootWorldPos = new THREE.Vector3();
                lootRef.current.getWorldPosition(lootWorldPos);
                const distance = playerPosition.distanceTo(lootWorldPos);
                
                return distance <= pickupDistance * 1.5 ? (
                    <mesh position={[0, 0.8, 0]}>
                        <planeGeometry args={[0.8, 0.2]} />
                        <meshBasicMaterial 
                            color="white"
                            transparent
                            opacity={0.8}
                        />
                    </mesh>
                ) : null;
            })()}
        </group>
    );
};

export default Loot;