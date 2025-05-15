import React, { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { Howl } from 'howler';

import { EventEmitter } from 'events';
import { useFrame } from '@react-three/fiber';

interface GunProps {
    gunRef: React.RefObject<THREE.Group>;
    camera: THREE.Camera;
    shootEvent: EventEmitter;
    obstacles: THREE.Mesh[];
}

interface BulletTrace {
    id: number;
    start: THREE.Vector3;
    end: THREE.Vector3;
    createdAt: number;
}

const Gun: React.FC<GunProps> = ({ gunRef, camera, shootEvent, obstacles }) => {
    const shootingInterval = useRef<NodeJS.Timeout | null>(null);
    const [muzzleFlash, setMuzzleFlash] = useState(false);
    const [isReloading, setIsReloading] = useState(false);
    const [ammo, setAmmo] = useState(10);
    const [bulletTraces, setBulletTraces] = useState<BulletTrace[]>([]);
    const maxAmmo = 10;

    const raycaster = useRef(new THREE.Raycaster());
    const muzzleFlashTimeout = useRef<NodeJS.Timeout | null>(null);
    const bulletIdCounter = useRef(0);
    const barrelEndRef = useRef(new THREE.Vector3(0, 0, -0.95));
    const isRecoiling = useRef(false);
    const recoilProgress = useRef(0);

    console.log("gun called");

    const reload = () => {
        if (isReloading) return;

        // Play reload sound
        const reloadSound = new Howl({
            src: ['/sounds/reload.mp3'],
            volume: 0.7,
        });
        reloadSound.play();

        setIsReloading(true);

        // Reload animation timing
        setTimeout(() => {
            setAmmo(maxAmmo);
            setIsReloading(false);
        }, 2000);
    };

    // Track ammo locally for immediate response
    const currentAmmo = useRef(ammo);

    // Keep currentAmmo in sync with state
    useEffect(() => {
        currentAmmo.current = ammo;
    }, [ammo]);

    const shootBullet = () => {
        // Don't shoot if reloading
        if (isReloading) return;

        // Auto-reload if empty
        if (currentAmmo.current <= 0) {
            reload();
            return;
        }

        // Start recoil
        isRecoiling.current = true;
        recoilProgress.current = 0;

        // Play gun shot sound
        const gunShotSound = new Howl({
            src: ['/sounds/gunshot.mp3'],
            volume: 0.5,
        });

        // Avoid multiple intervals
        if (shootingInterval.current) return;

        const recoilAnimate = () => {
            if (!gunRef.current) return;
            console.log("animate")
            // Pull back
            gunRef.current.position.z = -0.7;

            // Return forward after 100ms
            setTimeout(() => {
                if (gunRef.current) {
                    gunRef.current.position.z = -0.6;
                }
            }, 100);
        };

        const fireOnce = () => {
            // Don't fire if reloading or out of ammo
            if (isReloading || currentAmmo.current <= 0) {
                if (shootingInterval.current) {

                    clearInterval(shootingInterval.current);
                    shootingInterval.current = null;
                }

                // Auto-reload if empty
                if (currentAmmo.current <= 0 && !isReloading) {
                    reload();
                }

                return;
            }

            recoilAnimate();

            // Decrease ammo - both in ref (immediate) and state
            currentAmmo.current -= 1;
            setAmmo(currentAmmo.current);

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


            const shootRaycaster = new THREE.Raycaster();
            const rayDirection = new THREE.Vector3();
            camera.getWorldPosition(rayDirection);

            const rayOrigin = camera.position.clone();
            shootRaycaster.set(rayOrigin, rayDirection);

            const maxDistance = 100;
            const thresholdRadius = 3;

            console.log(obstacles)

            obstacles.forEach(obstacle => {
                const playerPos = obstacle.position.clone();

                const toPlayer = new THREE.Vector3().subVectors(playerPos, rayOrigin);

                const projectionLength = toPlayer.dot(rayDirection);

                const closestPointOnRay = rayOrigin.clone().add(rayDirection.clone().multiplyScalar(projectionLength));
                const distanceToRay = playerPos.distanceTo(closestPointOnRay);

                if (distanceToRay <= thresholdRadius) {
                    console.log("Player near ray within radius and segment");
                    // Trigger hit or near-miss logic here
                } else {
                    console.log("Player far from ray", distanceToRay, thresholdRadius);
                }
            });

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

    // Handle reload animation
    useEffect(() => {
        let animationFrame: number;
        const animateReload = () => {
            if (isReloading) {
                // Calculate elapsed time since reload started
                const time = Date.now() % 1200 / 1200;

                // Animation timing curve
                const rotationX = isReloading ? -Math.sin(time * Math.PI) * 0.3 : 0;

                // Update gun rotation
                if (gunRef.current) {
                    gunRef.current.rotation.x = rotationX;
                }

                animationFrame = requestAnimationFrame(animateReload);
            } else if (gunRef.current) {
                // Reset rotation when not reloading
                gunRef.current.rotation.x = 0;
            }
        };

        animationFrame = requestAnimationFrame(animateReload);

        return () => {
            cancelAnimationFrame(animationFrame);
        };
    }, [isReloading]);

    return (
        <group ref={gunRef} position={[0.5, -0.3, -0.5]}>
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

            {/* Barrel end reference point */}
            <mesh ref={barrelEndRef} position={[0, 0, -0.95]} visible={false}>
                <boxGeometry args={[0.01, 0.01, 0.01]} />
                <meshBasicMaterial opacity={0} transparent />
            </mesh>

            {/* Ammo clip */}
            <mesh position={[0, -0.2, -0.3]}>
                <boxGeometry args={[0.3, 0.3, 0.15]} />
                <meshStandardMaterial color="darkgray" />
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


            {/* Reload animation - ejected magazine */}
            {isReloading && (
                <mesh position={[0, -0.5 - (Math.sin(Date.now() % 1200 / 1200 * Math.PI) * 0.3), -0.3]}>
                    <boxGeometry args={[0.28, 0.28, 0.13]} />
                    <meshStandardMaterial color="black" />
                </mesh>
            )}
        </group>
    );
};

export default Gun;