import React, { useRef, useState, RefObject, useEffect } from 'react';
import * as THREE from 'three';
import { Howl } from 'howler';
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
    const maxAmmo = 30;
    const shootingInterval = useRef<NodeJS.Timeout | null>(null);
    const muzzleFlash = useRef(false);
    const isReloading = useRef(false);
    const bulletTracersRef = useRef<BulletTracer[]>([]);
    const scene = useThree().scene;

    const muzzleFlashTimeout = useRef<NodeJS.Timeout | null>(null);
    const barrelEndRef = useRef<THREE.Mesh>(null);
    const isRecoiling = useRef(false);
    const recoilProgress = useRef(0);
    const bulletSpeed = 50; // units per second
    const maxTracerDistance = 1000;

    const instancedTracers = useRef<THREE.InstancedMesh | null>(null);
    const maxInstances = 100;
    const instanceData = useRef<Array<{
        active: boolean;
        position: THREE.Vector3;
        direction: THREE.Vector3;
        startPos: THREE.Vector3;
        createdAt: number;
    }>>([]);


    // Initialize bullets instanced mesh
    useEffect(() => {
        const geometry = new THREE.SphereGeometry(0.1, 8, 8);
        const material = new THREE.MeshStandardMaterial({
            color: "#ffff00",
            emissive: "#ffff00",
            emissiveIntensity: 0.8
        });

        const instancedMesh = new THREE.InstancedMesh(geometry, material, maxInstances);
        instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        instancedMesh.frustumCulled = false;

        // Initialize all instances as inactive (scale to 0)
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < maxInstances; i++) {
            matrix.makeScale(0, 0, 0); // Hidden
            instancedMesh.setMatrixAt(i, matrix);
            instanceData.current.push({
                active: false,
                position: new THREE.Vector3(),
                direction: new THREE.Vector3(),
                startPos: new THREE.Vector3(),
                createdAt: 0
            });
        }

        instancedMesh.instanceMatrix.needsUpdate = true;
        instancedTracers.current = instancedMesh;
        scene.add(instancedMesh);

        return () => {
            scene.remove(instancedMesh);
            geometry.dispose();
            material.dispose();
        };
    }, []);

    // Modified createBulletTracer
    const createBulletTracer = () => {
        if (!instancedTracers.current) return;

        // Find inactive instance
        const availableIndex = instanceData.current.findIndex(data => !data.active);
        if (availableIndex === -1) return;

        // Get barrel position
        let barrelWorldPos = new THREE.Vector3();
        if (gunRef.current && barrelEndRef.current) {
            barrelEndRef.current.getWorldPosition(barrelWorldPos);
        } else {
            barrelWorldPos = camera.position.clone();
        }

        const bulletDirection = camera.getWorldDirection(new THREE.Vector3()).normalize();

        // Activate instance
        const data = instanceData.current[availableIndex];
        data.active = true;
        data.position.copy(barrelWorldPos);
        data.direction.copy(bulletDirection);
        data.startPos.copy(barrelWorldPos);
        data.createdAt = Date.now();

        // Update matrix
        const matrix = new THREE.Matrix4();
        matrix.makeTranslation(barrelWorldPos.x, barrelWorldPos.y, barrelWorldPos.z);
        instancedTracers.current.setMatrixAt(availableIndex, matrix);
        instancedTracers.current.instanceMatrix.needsUpdate = true;
    };


    const updateAmmo = (newAmmo: number) => {
        ammoRef.current = newAmmo;
    };

    // Animation loop for bullet tracers
    useFrame((state, delta) => {
        if (!instancedTracers.current) return;

        const now = Date.now();
        let needsUpdate = false;
        const matrix = new THREE.Matrix4();

        instanceData.current.forEach((data, index) => {
            if (!data.active) return;

            // Move tracer
            const movement = data.direction.clone().multiplyScalar(bulletSpeed * delta);
            data.position.add(movement);

            // Check if should deactivate
            const distanceTraveled = data.position.distanceTo(data.startPos);
            const age = now - data.createdAt;

            if (distanceTraveled >= maxTracerDistance || age > 1000) {
                // Deactivate
                data.active = false;
                matrix.makeScale(0, 0, 0); // Hide
                needsUpdate = true;
            } else {
                // Update position
                matrix.makeTranslation(data.position.x, data.position.y, data.position.z);
                needsUpdate = true;
            }

            instancedTracers.current!.setMatrixAt(index, matrix);
        });

        if (needsUpdate) {
            instancedTracers.current.instanceMatrix.needsUpdate = true;
        }
    });

    const reload = () => {
        if (isReloading.current) return;

        const reloadSound = new Howl({
            src: ['/sounds/reload.mp3'],
            volume: 0.7,
        });
        reloadSound.play();

        isReloading.current = true

        setTimeout(() => {
            updateAmmo(maxAmmo);
            isReloading.current = false
        }, 2000);
    };

    const shootBullet = () => {
        if (isReloading.current) return;

        if (ammoRef.current <= 0) {
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
            gunRef.current.position.z = -0.7;
            setTimeout(() => {
                if (gunRef.current) {
                    gunRef.current.position.z = -0.6;
                }
            }, 100);
        };

        const fireOnce = () => {
            if (isReloading.current || ammoRef.current <= 0) {
                if (shootingInterval.current) {
                    clearInterval(shootingInterval.current);
                    shootingInterval.current = null;
                }

                if (ammoRef.current <= 0 && !isReloading.current) {
                    reload();
                }
                return;
            }

            recoilAnimate();
            ammoRef.current -= 1;
            gunShotSound.play();
            muzzleFlash.current = true

            if (muzzleFlashTimeout.current) {
                clearTimeout(muzzleFlashTimeout.current);
            }

            muzzleFlashTimeout.current = setTimeout(() => {
                muzzleFlash.current = false
            }, 50);

            // Create bullet tracer from barrel position
            createBulletTracer();

        };

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
            bulletTracersRef.current = [];
            scene.children.forEach(child => {
                if (child.userData.tracerId) {
                    scene.remove(child);
                }
            });
        };
    }, [shootEvent]);

    useEffect(() => {
        let animationFrame: number;
        const animateReload = () => {
            if (isReloading.current) {
                const time = Date.now() % 1200 / 1200;
                const rotationX = isReloading.current ? -Math.sin(time * Math.PI) * 0.3 : 0;

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
    }, [isReloading.current]);

    // Force update workaround for react-three-fiber
    const [, setDummy] = useState(0);
    useEffect(() => {
        const forceUpdate = () => setDummy(Math.random());
        document.addEventListener('forceUpdate', forceUpdate);
        return () => document.removeEventListener('forceUpdate', forceUpdate);
    }, []);

    return (
        <group frustumCulled={true} ref={gunRef} position={[0.5, -0.3, -0.5]}>
            <mesh>
                <boxGeometry args={[0.4, 0.2, 1]} />
                <meshStandardMaterial color="gray" />
            </mesh>
            <mesh position={[0, 0, -0.7]}>
                <cylinderGeometry args={[0.05, 0.05, 0.5, 16]} />
                <meshStandardMaterial color="black" />
            </mesh>
            <mesh ref={barrelEndRef} position={[0, 0, -0.95]} visible={false}>
                <boxGeometry args={[0.01, 0.01, 0.01]} />
                <meshBasicMaterial opacity={0} transparent />
            </mesh>
            <mesh position={[0, -0.2, -0.3]}>
                <boxGeometry args={[0.3, 0.3, 0.15]} />
                <meshStandardMaterial color="darkgray" />
            </mesh>
            {muzzleFlash.current && (
                <>
                    <mesh position={[0, 0, -0.95]}>
                        <sphereGeometry args={[0.1, 8, 8]} />
                        <meshBasicMaterial color="orange" />
                    </mesh>
                    <pointLight position={[0, 0, -0.95]} color="orange" intensity={5} distance={2} />
                </>
            )}
            {bulletTracersRef.current.map(tracer => (
                tracer.active && (
                    <group key={tracer.id} userData={{ tracerId: tracer.id }}>
                        <mesh position={[tracer.position.x, tracer.position.y, tracer.position.z]}>
                            <sphereGeometry args={[0.1, 8, 8]} />
                            <meshStandardMaterial
                                color="#ffff00"
                                emissive="#ffff00"
                                emissiveIntensity={10.8}
                            />
                        </mesh>
                        <mesh position={[tracer.position.x, tracer.position.y, tracer.position.z]}>
                            <sphereGeometry args={[0.08, 8, 8]} />
                            <meshBasicMaterial
                                color="#ffaa00"
                                transparent
                                opacity={0.3}
                            />
                        </mesh>
                        <pointLight
                            position={[tracer.position.x, tracer.position.y, tracer.position.z]}
                            color="#ffff00"
                            intensity={0.5}
                            distance={30}
                        />
                    </group>
                )
            ))}
            {isReloading.current && (
                <mesh position={[0, -0.5 - (Math.sin(Date.now() % 1200 / 1200 * Math.PI) * 0.3), -0.3]}>
                    <boxGeometry args={[0.28, 0.28, 0.13]} />
                    <meshStandardMaterial color="black" />
                </mesh>
            )}
        </group>
    );
};

export default Gun;