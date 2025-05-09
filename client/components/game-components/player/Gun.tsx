import React, { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { Howl } from 'howler';

import { EventEmitter } from 'events';

interface GunProps {
    gunRef: React.RefObject<THREE.Group>;
    camera: THREE.Camera;
    shootEvent: EventEmitter;
}

const Gun: React.FC<GunProps> = ({ gunRef, camera, shootEvent }) => {
    const shootingInterval = useRef<NodeJS.Timeout | null>(null);
    const [muzzleFlash, setMuzzleFlash] = useState(false);
    const [isReloading, setIsReloading] = useState(false);
    const [ammo, setAmmo] = useState(30);
    const maxAmmo = 30;

    const raycaster = useRef(new THREE.Raycaster());
    const muzzleFlashTimeout = useRef<NodeJS.Timeout | null>(null);
    const bulletIdCounter = useRef(0);
    const barrelEndRef = useRef(new THREE.Vector3(0, 0, -0.95));
    const gunRotation = useRef(new THREE.Euler(0, 0, 0));

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

        // Play gun shot sound
        const gunShotSound = new Howl({
            src: ['/sounds/gunshot.mp3'],
            volume: 0.5,
        });

        // Avoid multiple intervals
        if (shootingInterval.current) return;

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

            {/* Ammo clip */}
            <mesh position={[0, -0.2, -0.3]}>
                <boxGeometry args={[0.3, 0.3, 0.15]} />
                <meshStandardMaterial color="darkgray" />
            </mesh>

            {/* Muzzle flash. */}
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