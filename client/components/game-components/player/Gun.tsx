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
    userId: string;
    obstacles: any;
}

const Gun: React.FC<GunProps> = ({ gunRef, camera, shootEvent, ammoRef, obstacles }) => {
    const maxAmmo = 30;
    const shootingInterval = useRef<NodeJS.Timeout | null>(null);
    const muzzleFlash = useRef(false);
    const isReloading = useRef(false);
    const scene = useThree().scene;

    const muzzleFlashTimeout = useRef<NodeJS.Timeout | null>(null);
    const barrelEndRef = useRef<THREE.Mesh>(null);
    const isRecoiling = useRef(false);
    const recoilProgress = useRef(0);
    const bulletSpeed = 50; // units per second
    const maxTracerDistance = 100;

    const raycaster = useRef(new THREE.Raycaster()); // Single raycaster instance
    const mouse = useRef(new THREE.Vector2(0, 0)); // Center of the screen, reusable

    const instancedTracers = useRef<THREE.InstancedMesh | null>(null);
    const instancedTrails = useRef<THREE.InstancedMesh | null>(null);
    const maxInstances = 100;
    const instanceData = useRef<Array<{
        active: boolean;
        position: THREE.Vector3;
        direction: THREE.Vector3;
        startPos: THREE.Vector3;
        createdAt: number;
    }>>([]);

    // Initialize bullets and trails instanced meshes
    useEffect(() => {
        const bulletGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        const bulletMaterial = new THREE.MeshStandardMaterial({
            color: "#ffff00",
            emissive: "#ffff00",
            emissiveIntensity: 0.8,
        });

        const instancedBulletMesh = new THREE.InstancedMesh(bulletGeometry, bulletMaterial, maxInstances);
        instancedBulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        instancedBulletMesh.frustumCulled = false;

        const trailGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
        const trailMaterial = new THREE.MeshStandardMaterial({
            color: "#ffffff",
            transparent: true,
            opacity: 0.7,
            emissive: "#ffffff",
            emissiveIntensity: 0.3,
        });

        const instancedTrailMesh = new THREE.InstancedMesh(trailGeometry, trailMaterial, maxInstances);
        instancedTrailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        instancedTrailMesh.frustumCulled = false;

        instancedTrailMesh.instanceColor = new THREE.InstancedBufferAttribute(
            new Float32Array(maxInstances * 3),
            3
        );

        const matrix = new THREE.Matrix4();
        const color = new THREE.Color();
        for (let i = 0; i < maxInstances; i++) {
            matrix.makeScale(0, 0, 0);
            instancedBulletMesh.setMatrixAt(i, matrix);
            instancedTrailMesh.setMatrixAt(i, matrix);
            instancedTrailMesh.setColorAt(i, color.set(0, 0, 0));
            instanceData.current.push({
                active: false,
                position: new THREE.Vector3(),
                direction: new THREE.Vector3(),
                startPos: new THREE.Vector3(),
                createdAt: 0,
            });
        }

        instancedBulletMesh.instanceMatrix.needsUpdate = true;
        instancedTrailMesh.instanceMatrix.needsUpdate = true;
        instancedTrailMesh.instanceColor!.needsUpdate = true;
        instancedTracers.current = instancedBulletMesh;
        instancedTrails.current = instancedTrailMesh;
        scene.add(instancedBulletMesh, instancedTrailMesh);

        return () => {
            scene.remove(instancedBulletMesh, instancedTrailMesh);
            bulletGeometry.dispose();
            bulletMaterial.dispose();
            trailGeometry.dispose();
            trailMaterial.dispose();
        };
    }, [scene]);

    const createBulletTracer = () => {
        if (!instancedTracers.current || !instancedTrails.current) return;

        const availableIndex = instanceData.current.findIndex((data) => !data.active);
        if (availableIndex === -1) return;

        let barrelWorldPos = new THREE.Vector3();
        if (gunRef.current && barrelEndRef.current) {
            barrelEndRef.current.getWorldPosition(barrelWorldPos);
        } else {
            barrelWorldPos = camera.position.clone();
        }

        raycaster.current.setFromCamera(mouse.current, camera);

        let bulletDirection = camera.getWorldDirection(new THREE.Vector3()).normalize();
        const intersects = raycaster.current.intersectObjects(obstacles, false);

        if (intersects.length > 0) {
            const point = intersects[0].point;
            bulletDirection = point.clone().sub(barrelWorldPos).normalize();
        }

        const data = instanceData.current[availableIndex];
        data.active = true;
        data.position.copy(barrelWorldPos);
        data.direction.copy(bulletDirection);
        data.startPos.copy(barrelWorldPos);
        data.createdAt = Date.now();

        const bulletMatrix = new THREE.Matrix4();
        bulletMatrix.makeTranslation(barrelWorldPos.x, barrelWorldPos.y, barrelWorldPos.z);
        instancedTracers.current.setMatrixAt(availableIndex, bulletMatrix);

        const trailMatrix = new THREE.Matrix4();
        trailMatrix.makeTranslation(barrelWorldPos.x, barrelWorldPos.y, barrelWorldPos.z);
        instancedTrails.current.setMatrixAt(availableIndex, trailMatrix);
        instancedTrails.current.setColorAt(availableIndex, new THREE.Color(1, 1, 1));

        instancedTracers.current.instanceMatrix.needsUpdate = true;
        instancedTrails.current.instanceMatrix.needsUpdate = true;
        instancedTrails.current.instanceColor!.needsUpdate = true;
    };

    useFrame((state, delta) => {

        if (gunRef.current && camera) {
            gunRef.current.lookAt(camera.position.clone());
        }


        if (!instancedTracers.current || !instancedTrails.current) return;

        const now = Date.now();
        let needsUpdate = false;
        const bulletMatrix = new THREE.Matrix4();
        const trailMatrix = new THREE.Matrix4();

        instanceData.current.forEach((data, index) => {
            if (!data.active) return;

            const movement = data.direction.clone().multiplyScalar(bulletSpeed * delta);
            data.position.add(movement);

            const distanceTraveled = data.position.distanceTo(data.startPos);
            const age = now - data.createdAt;

            if (distanceTraveled >= maxTracerDistance || age > 1000) {
                data.active = false;
                bulletMatrix.makeScale(0, 0, 0);
                trailMatrix.makeScale(0, 0, 0);
                instancedTrails.current?.setColorAt(index, new THREE.Color(0, 0, 0));
                needsUpdate = true;
            } else {
                bulletMatrix.makeTranslation(data.position.x, data.position.y, data.position.z);

                const trailLength = 5;
                const trailOffset = data.direction.clone().multiplyScalar(-trailLength * 0.5);
                const trailPosition = data.position.clone().add(trailOffset);
                trailMatrix.setPosition(trailPosition);

                const up = new THREE.Vector3(0, 1, 0);
                const direction = data.direction.clone();
                if (direction.lengthSq() > 0) {
                    const quaternion = new THREE.Quaternion().setFromUnitVectors(
                        up,
                        direction.normalize()
                    );
                    trailMatrix.makeRotationFromQuaternion(quaternion);
                    trailMatrix.scale(new THREE.Vector3(1, trailLength, 1));
                    trailMatrix.setPosition(trailPosition);
                }

                const fade = 1 - age / 1000;
                instancedTrails.current?.setColorAt(
                    index,
                    new THREE.Color(1, 1, 1).multiplyScalar(fade)
                );
                needsUpdate = true;
            }

            instancedTracers.current?.setMatrixAt(index, bulletMatrix);
            instancedTrails.current?.setMatrixAt(index, trailMatrix);
        });

        if (needsUpdate) {
            instancedTracers.current.instanceMatrix.needsUpdate = true;
            instancedTrails.current.instanceMatrix.needsUpdate = true;
            if (instancedTrails.current.instanceColor) {
                instancedTrails.current.instanceColor.needsUpdate = true;
            }
        }
    });

    const updateAmmo = (newAmmo: number) => {
        ammoRef.current = newAmmo;
    };

    const reload = () => {
        if (isReloading.current) return;
        if (ammoRef.current === maxAmmo) return;

        const reloadSound = new Howl({
            src: ['/sounds/reload.mp3'],
            volume: 0.7,
        });
        reloadSound.play();

        isReloading.current = true;

        setTimeout(() => {
            updateAmmo(maxAmmo);
            isReloading.current = false;
        }, 2000);
    };

    useEffect(() => {
        interface KeyboardEventWithKey extends KeyboardEvent {
            key: string;
        }

        const handleKeyDown = (e: KeyboardEventWithKey) => {
            if (e.key.toLowerCase() === 'r') {
                if (!isReloading.current) {
                    console.log("reloading");
                    reload();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

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
            muzzleFlash.current = true;

            if (muzzleFlashTimeout.current) {
                clearTimeout(muzzleFlashTimeout.current);
            }

            muzzleFlashTimeout.current = setTimeout(() => {
                muzzleFlash.current = false;
            }, 50);

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
    }, []);

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