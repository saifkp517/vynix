import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Howl } from 'howler';
import EventEmitter from 'events';

const Gun: React.FC<{ 
  gunRef: React.RefObject<THREE.Group>; 
  camera: THREE.Camera; 
  shootEvent: EventEmitter 
}> = ({ gunRef, camera, shootEvent }) => {
    const shootingInterval = useRef<NodeJS.Timeout | null>(null);
    const [muzzleFlash, setMuzzleFlash] = useState<boolean>(false);
    
    const raycaster = useRef(new THREE.Raycaster());
    const muzzleFlashTimeout = useRef<NodeJS.Timeout | null>(null);
    const bulletIdCounter = useRef(0);
    const barrelEndRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, -0.95));
    
    const shootBullet = () => {
        // Play gun shot sound
        const gunShotSound = new Howl({
            src: ['/sounds/gunshot.mp3'],
            volume: 0.5,
        });
        
        // Avoid multiple intervals
        if (shootingInterval.current) return;
        
        const fireOnce = () => {
            // Play sound
            gunShotSound.play();
            
            // Show muzzle flash
            setMuzzleFlash(true);
            
            // Clear previous timeout if exists
            if (muzzleFlashTimeout.current) {
                clearTimeout(muzzleFlashTimeout.current);
            }
            
            // Hide muzzle flash after short delay
            muzzleFlashTimeout.current = setTimeout(() => {
                setMuzzleFlash(false);
            }, 50);
            
            // Calculate bullet trajectory with raycaster
            if (gunRef.current) {
                // Get world position of barrel end
                const barrelWorldPosition = new THREE.Vector3();
                barrelEndRef.current.clone().applyMatrix4(gunRef.current.matrixWorld);
                gunRef.current.localToWorld(barrelWorldPosition.copy(barrelEndRef.current));
                
                // Set raycaster position and direction from camera
                raycaster.current.setFromCamera(new THREE.Vector2(0, 0), camera);
                
                // Get the ray direction
                const rayDirection = new THREE.Vector3();
                raycaster.current.ray.direction.normalize();
                rayDirection.copy(raycaster.current.ray.direction);
                
                // Calculate bullet end position - extend ray by 100 units
                const bulletEndPosition = new THREE.Vector3().copy(barrelWorldPosition).addScaledVector(rayDirection, 100);
                
                // Add new bullet trace
                const newBulletTrace = {
                    start: barrelWorldPosition.clone(),
                    end: bulletEndPosition.clone(),
                    id: bulletIdCounter.current++,
                    createdAt: Date.now()
                };
                
            }
        };
        
        // Fire immediately
        fireOnce();
        
        // Set interval for continuous fire
        shootingInterval.current = setInterval(fireOnce, 150);
    };
    
    useEffect(() => {
        // Set up event listeners
        shootEvent.on("start", shootBullet);
        
        shootEvent.on("stop", () => {
            if (shootingInterval.current) {
                clearInterval(shootingInterval.current);
                shootingInterval.current = null;
            }
        });
        
        // Clean up
        return () => {
            shootEvent.removeAllListeners();
            if (shootingInterval.current) {
                clearInterval(shootingInterval.current);
            }
            if (muzzleFlashTimeout.current) {
                clearTimeout(muzzleFlashTimeout.current);
            }
        };
    }, [shootEvent]);
    
    return (
        <group ref={gunRef} position={[0.5, -0.5, -0.5]}>
            {/* Gun body */}
            <mesh>
                <boxGeometry args={[0.4, 0.2, 1]} />
                <meshStandardMaterial color="gray" />
            </mesh>
            
            {/* Gun barrel */}
            <mesh position={[0, 0, -0.7]}>
                <cylinderGeometry args={[0.05, 0.05, 0.5, 16]} />
                <meshStandardMaterial color="black" />
            </mesh>
            
            {/* Muzzle flash */}
            {muzzleFlash && (
                <>
                    {/* Central flash */}
                    <mesh position={[0, 0, -0.95]}>
                        <sphereGeometry args={[0.1, 8, 8]} />
                        <meshBasicMaterial color="orange" />
                    </mesh>
                    
                    {/* Outer glow */}
                    <pointLight position={[0, 0, -0.95]} color="orange" intensity={5} distance={2} />
                </>
            )}
            
            {/* Bullet traces */}

        </group>
    );
};

export default Gun;