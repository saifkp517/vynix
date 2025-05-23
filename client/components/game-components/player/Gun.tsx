import React, { useRef, useState, RefObject, useEffect } from 'react';
import * as THREE from 'three';
import { Howl } from 'howler';
import socket from '@/lib/socket';
import { EventEmitter } from 'events';
import { useFrame, useThree } from '@react-three/fiber';

interface GunProps {
    gunRef: React.RefObject<THREE.Group>;
    ammoRef: RefObject<number>;
    camera: THREE.Camera;
    shootEvent: EventEmitter;
    pingRef: RefObject<number>;
    otherPlayers: RefObject<{ [playerId: string]: { position: THREE.Vector3; velocity: THREE.Vector3 } }>;
    userId: string;
}

interface BulletTrace {
    id: number;
    start: THREE.Vector3;
    end: THREE.Vector3;
    createdAt: number;
    direction: THREE.Vector3;
    distance: number;
}

interface BulletTracer {
    id: number;
    position: THREE.Vector3;
    direction: THREE.Vector3;
    startPos: THREE.Vector3;
    maxDistance: number;
    speed: number;
    createdAt: number;
    active: boolean;
}

const Gun: React.FC<GunProps> = ({ gunRef, camera, shootEvent, pingRef, userId, ammoRef, otherPlayers }) => {
    const maxAmmo = 100;
    const shootingInterval = useRef<NodeJS.Timeout | null>(null);
    const [muzzleFlash, setMuzzleFlash] = useState(false);
    const [isReloading, setIsReloading] = useState(false);
    const [ammo, setAmmo] = useState(maxAmmo);
    const [bulletTracers, setBulletTracers] = useState<BulletTracer[]>([]);
    const scene = useThree().scene;

    const raycaster = useRef(new THREE.Raycaster());
    const muzzleFlashTimeout = useRef<NodeJS.Timeout | null>(null);
    const bulletIdCounter = useRef(0);
    const barrelEndRef = useRef(new THREE.Vector3(0, 0, -0.95));
    const isRecoiling = useRef(false);
    const recoilProgress = useRef(0);
    const tracerSpeed = 150; // units per second
    const maxTracerDistance = 100;

    const updateAmmo = (newAmmo: number) => {
        ammoRef.current = newAmmo;
        setAmmo(newAmmo);
    };


    // Animation loop for bullet tracers
    useFrame((state, delta) => {
        setBulletTracers(prevTracers => {
            return prevTracers.map(tracer => {
                if (!tracer.active) return tracer;

                // Calculate new position
                const movement = tracer.direction.clone().multiplyScalar(tracer.speed * delta);
                const newPosition = tracer.position.clone().add(movement);
                
                // Check if tracer has traveled max distance
                const distanceTraveled = newPosition.distanceTo(tracer.startPos);
                
                if (distanceTraveled >= tracer.maxDistance) {
                    return { ...tracer, active: false };
                }

                return {
                    ...tracer,
                    position: newPosition
                };
            }).filter(tracer => {
                // Remove inactive tracers after a short delay
                const age = Date.now() - tracer.createdAt;
                return tracer.active || age < 100;
            });
        });
    });

    const createBulletTracer = (startPos: THREE.Vector3, direction: THREE.Vector3) => {
        const newTracer: BulletTracer = {
            id: bulletIdCounter.current++,
            position: startPos.clone(),
            direction: direction.clone().normalize(),
            startPos: startPos.clone(),
            maxDistance: maxTracerDistance,
            speed: tracerSpeed,
            createdAt: Date.now(),
            active: true
        };

        setBulletTracers(prev => [...prev, newTracer]);
    };

    const reload = () => {
        if (isReloading) return;

        const reloadSound = new Howl({
            src: ['/sounds/reload.mp3'],
            volume: 0.7,
        });
        reloadSound.play();

        setIsReloading(true);

        setTimeout(() => {
            updateAmmo(maxAmmo);
            setIsReloading(false);
        }, 2000);
    };

    const currentAmmo = useRef(ammo);

    useEffect(() => {
        currentAmmo.current = ammo;
    }, [ammo]);

    const shootBullet = () => {
        if (isReloading) return;

        if (currentAmmo.current <= 0) {
            reload();
            return;
        }

        isRecoiling.current = true;
        recoilProgress.current = 0;

        const gunShotSound = new Howl({
            src: ['/sounds/gunshot.mp3'],
            volume: 0.5,
        });

        if (shootingInterval.current) return;

        const recoilAnimate = () => {
            if (!gunRef.current) return;
            console.log("animate")
            gunRef.current.position.z = -0.7;

            setTimeout(() => {
                if (gunRef.current) {
                    gunRef.current.position.z = -0.6;
                }
            }, 100);
        };

        const fireOnce = () => {
            console.log("fired")
            if (isReloading || currentAmmo.current <= 0) {
                if (shootingInterval.current) {
                    clearInterval(shootingInterval.current);
                    shootingInterval.current = null;
                }

                if (currentAmmo.current <= 0 && !isReloading) {
                    reload();
                }
                return;
            }

            recoilAnimate();

            currentAmmo.current -= 1;
            updateAmmo(currentAmmo.current);

            gunShotSound.play();

            setMuzzleFlash(true);

            if (muzzleFlashTimeout.current) {
                clearTimeout(muzzleFlashTimeout.current);
            }

            muzzleFlashTimeout.current = setTimeout(() => {
                setMuzzleFlash(false);
            }, 50);

            // Get bullet start position and direction (same as ArrowHelper)
            const bulletDirection = camera.getWorldDirection(new THREE.Vector3());
            const bulletStartPos = camera.position.clone();

            // Create bullet tracer instead of ArrowHelper
            createBulletTracer(bulletStartPos, bulletDirection);

            // Optional: Keep ArrowHelper for debugging
            const arrowHelper = new THREE.ArrowHelper(
                bulletDirection,
                bulletStartPos,
                10000,
                0xffff00,
                2,
            );
            scene.add(arrowHelper);
            
            // Remove arrow after short time
            setTimeout(() => {
                scene.remove(arrowHelper);
            }, 100);
        };

        console.log("break")
        fireOnce();

        shootingInterval.current = setInterval(fireOnce, 150);
    };

    useEffect(() => {
        shootEvent.on("start", shootBullet);

        shootEvent.on("stop", () => {
            if (shootingInterval.current) {
                clearInterval(shootingInterval.current);
                shootingInterval.current = null;
            }
        });

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

    useEffect(() => {
        let animationFrame: number;
        const animateReload = () => {
            if (isReloading) {
                const time = Date.now() % 1200 / 1200;
                const rotationX = isReloading ? -Math.sin(time * Math.PI) * 0.3 : 0;

                if (gunRef.current) {
                    gunRef.current.rotation.x = rotationX;
                }

                animationFrame = requestAnimationFrame(animateReload);
            } else if (gunRef.current) {
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
                    <mesh position={[0, 0, -0.95]}>
                        <sphereGeometry args={[0.1, 8, 8]} />
                        <meshBasicMaterial color="orange" />
                    </mesh>
                    <pointLight position={[0, 0, -0.95]} color="orange" intensity={5} distance={2} />
                </>
            )}

            {/* Bullet Tracers */}
            {bulletTracers.map(tracer => (
                tracer.active && (
                    <group key={tracer.id}>
                        {/* Tracer bullet - bright glowing sphere */}
                        <mesh position={[tracer.position.x, tracer.position.y, tracer.position.z]}>
                            <sphereGeometry args={[0.02, 8, 8]} />
                            <meshStandardMaterial 
                                color="#ffff00" 
                                emissive="#ffff00"
                                emissiveIntensity={0.8}
                            />
                        </mesh>
                        
                        {/* Tracer trail effect */}
                        <mesh position={[tracer.position.x, tracer.position.y, tracer.position.z]}>
                            <sphereGeometry args={[0.05, 8, 8]} />
                            <meshBasicMaterial 
                                color="#ffaa00" 
                                transparent 
                                opacity={0.3}
                            />
                        </mesh>

                        {/* Point light for glow effect */}
                        <pointLight 
                            position={[tracer.position.x, tracer.position.y, tracer.position.z]} 
                            color="#ffff00" 
                            intensity={0.5} 
                            distance={3} 
                        />
                    </group>
                )
            ))}

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