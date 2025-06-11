// Player component
import React, { useRef, useState, useEffect, RefObject } from 'react';
import { PointerLockControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber'
import socket from '@/lib/socket';
import { Howl } from 'howler';
import Explosion from '../explosion/Explosion';
import Gun from './Gun';
import { Vector3, Box3, Mesh, Camera, Raycaster, Sphere, SphereGeometry, CylinderGeometry, Matrix4 } from 'three';
import { EventEmitter } from 'events';



interface PlayerProps {
    obstacles: any;
    onCenterUpdate: (center: Vector3) => void;
    playerCenterRef: RefObject<Vector3>;
    pingRef: RefObject<number>;
    crosshairRef: RefObject<{ triggerHit: () => void }>;
    grenadeCoolDownRef: RefObject<boolean>;
    getGroundHeight: (x: number, z: number) => number;
    ammoRef: RefObject<number>;
    otherPlayers: RefObject<{ [playerId: string]: { position: Vector3; velocity: Vector3 } }>;
    controlsRef: RefObject<any>;
    userId: string;
}

type FireballProps = {
    position: Vector3;
    getGroundHeight: (x: number, z: number) => number;
    direction: Vector3;
    speed?: number;
    obstacles?: Mesh[];
    onExplode: (position: Vector3) => void;
};

type GunProps = {
    camera: Camera
}





const Fireball: React.FC<FireballProps> = ({ position, getGroundHeight, direction, speed = 20, obstacles, onExplode }) => {
    const fireballRef = useRef<Mesh>(null);
    const startTime = useRef<number>(Date.now());

    const gravity = 9.8; // Gravity constant (adjust for desired arc height)



    useFrame(() => {
        if (!fireballRef.current) return;

        const elapsedTime = (Date.now() - startTime.current) / 1000;

        const initialPosition = fireballRef.current.position.clone();
        const initialVelocity = direction.clone().multiplyScalar(speed);

        // x and z are linear motion
        fireballRef.current.position.x = initialPosition.x + initialVelocity.x * elapsedTime;
        fireballRef.current.position.z = initialPosition.z + initialVelocity.z * elapsedTime;

        // y is affected by gravity (parabolic arc)
        fireballRef.current.position.y = initialPosition.y +
            initialVelocity.y * elapsedTime -
            0.5 * gravity * elapsedTime * elapsedTime;

        // Collision detection with ground and obstacles
        const fireballPosition = fireballRef.current.position.clone();


        if (fireballPosition.y <= getGroundHeight(fireballPosition.x, fireballPosition.z)) {
            onExplode(fireballPosition);
            return;
        }

        for (const obstacle of obstacles!) {

            const fireballBox = new Box3().setFromObject(fireballRef.current);
            const obstacleBox = new Box3().setFromObject(obstacle);


            const obstacleCenter = new Vector3();
            obstacleBox.getCenter(obstacleCenter);


            if (fireballBox.intersectsBox(obstacleBox)) {
                onExplode(fireballPosition);
                return;
            }
        }
    });

    return (
        <mesh ref={fireballRef} position={position} castShadow>
            <sphereGeometry args={[0.5, 16, 16]} />
            <meshStandardMaterial emissive={"orange"} emissiveIntensity={2} color="red" />
        </mesh>
    );
};



const Player: React.FC<PlayerProps> = ({
    obstacles,
    onCenterUpdate,
    playerCenterRef,
    controlsRef,
    crosshairRef,
    getGroundHeight,
    grenadeCoolDownRef,
    otherPlayers,
    ammoRef,
    pingRef,
    userId
}) => {

    const { camera } = useThree();
    const [colliding, setColliding] = useState(false);
    const [collisionNormal, setCollisionNormal] = useState<Vector3 | null>(null);
    const jumpRequested = useRef(false);
    const playerRef = useRef<Mesh>(null);
    const jumpDirection = useRef(new Vector3());
    const isJumpingRef = useRef(false);
    const [fireballs, setFireballs] = useState<{ id: number; position: Vector3; direction: Vector3 }[]>([]);
    const [collisionType, setCollisionType] = useState("");
    const [explosions, setExplosions] = useState<{ id: number; position: Vector3 }[]>([]);
    const lastUpdateTime = useRef(0);
    const explosionRadius = 15; // Explosion radius for damage calculation
    const [hitPlayers, setHitPlayers] = useState<{ [id: string]: boolean }>({});

    const playerPosition = useRef<Vector3>(new Vector3(0, 0, 0));
    const playerVelocity = useRef<Vector3>(new Vector3());
    const playerSpeed = useRef(10);
    const playerHeight = 3;
    const gravity = -9.8 * 4;
    const jumpStrength = 20;


    const raycaster = new Raycaster();
    let shootDirection = new Vector3();
    const recoilProgress = useRef(0);
    const isRecoiling = useRef(false);

    const shootEvent = useRef(new EventEmitter());

    function handleShoot() {
        camera.getWorldDirection(shootDirection);

        // Set ray origin and direction
        raycaster.set(camera.position, shootDirection);

        // Raycast against all mesh objects in the scene
        const intersects = raycaster.intersectObjects(obstacles, true); // true = recursive



        if (intersects.length > 0) {
            const firstHit = intersects[0];
            shootDirection = new Vector3().subVectors(firstHit.point, playerCenterRef.current).normalize();

            const hitX = firstHit.point.x;
            const hitZ = firstHit.point.z;
            const hitY = firstHit.point.y;

            const groundY = getGroundHeight(hitX, hitZ);

            const threshold = 0.1; // Tolerance for noise or minor overlap

            if (hitY <= groundY + threshold) {
                console.log("🚫 Shot blocked by terrain at", { x: hitX, y: groundY, z: hitZ });
            } else {
                const players = Object.values(otherPlayers.current);

                function rayIntersectsSphere(
                    rayOrigin: Vector3,
                    rayDirection: Vector3,
                    sphereCenter: Vector3,
                    sphereRadius: number
                ): { hit: boolean, distance: number } {

                    if (!rayOrigin || !rayDirection || !sphereCenter) {
                        console.error("Invalid argument passed to rayIntersectsSphere:", {
                            rayOrigin,
                            rayDirection,
                            sphereCenter
                        });
                        return { hit: false, distance: Infinity };
                    }

                    const toCenter = new Vector3().subVectors(sphereCenter, rayOrigin);
                    const projectionLength = toCenter.dot(rayDirection);

                    // Sphere is behind the ray origin
                    if (projectionLength < 0) return { hit: false, distance: Infinity };

                    const closestPoint = rayOrigin.clone().add(rayDirection.clone().multiplyScalar(projectionLength));
                    const distanceToCenter = closestPoint.distanceTo(sphereCenter);

                    const hit = distanceToCenter <= sphereRadius;
                    return { hit, distance: distanceToCenter };
                } 

                players.forEach((player) => {
                    const playerPosition = player.position.clone().add(new Vector3(0, -1, 0)); // Adjust for sphere offset
                    const playerRadius = 2; // Match the sphereGeometry radius
                    

                    const { hit, distance } = rayIntersectsSphere(playerCenterRef.current, shootDirection , playerPosition, playerRadius)
                    if (hit) {
                        console.log("hit!");
                        crosshairRef?.current?.triggerHit();
                    } else {
                        console.log("missed by distance: ", distance)
                    }
                });

            }
        } else {
            console.log("missed: ", intersects.length);
        }

        const shootObject = {
            rayOrigin: playerCenterRef.current,
            rayDirection: shootDirection,
            timestamp: Date.now(),
            ping: pingRef.current
        };
        socket.emit("shoot", { userId, shootObject });

    }

    const checkCollisions = (playerPosition: Vector3) => {

        // Create player hitbox - keeping box for player
        const playerBox = new Box3().setFromCenterAndSize(
            playerPosition,
            new Vector3(1, 2, 1) // Player size
        );

        // Player sphere representation (for sphere-to-sphere collision)
        const playerSphere = new Sphere(
            playerPosition.clone(),
            1 // Player radius (adjust based on your player size)
        );

        // Get player center for calculations
        const playerCenter = new Vector3();
        playerBox.getCenter(playerCenter);

        // Check collision with each obstacle
        let isColliding = false;
        for (const obstacle of obstacles) {
            if (!obstacle) continue;

            // Determine if obstacle is spherical by checking its geometry
            const isObstacleSphere = obstacle.geometry instanceof SphereGeometry;
            const isObstacleCylinder = obstacle.geometry instanceof CylinderGeometry;

            if (isObstacleSphere) {
                // Handle sphere collision
                // Get sphere center and radius from obstacle
                const obstaclePosition = obstacle.position.clone();
                const obstacleRadius = obstacle.geometry.parameters.radius * obstacle.scale.x; // Assuming uniform scale



                // Calculate distance between centers
                const distance = playerCenter.distanceTo(obstaclePosition);
                const minDistance = playerSphere.radius + obstacleRadius;

                if (distance < minDistance) {
                    setCollisionType("sphere")
                    // Calculate collision normal (direction from obstacle to player)
                    const collisionNormal = new Vector3()
                        .subVectors(playerCenter, obstaclePosition)
                        .normalize();

                    setCollisionNormal(collisionNormal);
                    isColliding = true;
                    break;
                }
            } else if (isObstacleCylinder) {
                // Handle cylinder collision with any orientation
                const obstaclePosition = new Vector3();
                obstacle.getWorldPosition(obstaclePosition);

                const obstacleScale = new Vector3();
                obstacle.getWorldScale(obstacleScale);

                // Get cylinder properties
                const radiusTop = obstacle.geometry.parameters.radiusTop;
                const radiusBottom = obstacle.geometry.parameters.radiusBottom || radiusTop;


                const radius = Math.max(radiusTop, radiusBottom) * Math.max(obstacleScale.x, obstacleScale.z);
                const height = obstacle.geometry.parameters.height * obstacleScale.y;

                // Get cylinder's axis vector (assuming Y is the height axis in cylinder geometry)
                // We need to extract the Y axis of the cylinder from its world matrix
                const cylinderMatrix = obstacle.matrixWorld.clone();
                const cylinderUpVector = new Vector3(0, 1, 0).applyMatrix4(
                    new Matrix4().extractRotation(cylinderMatrix)
                ).normalize();

                // Get cylinder endpoints
                const cylinderCenter = obstaclePosition.clone();
                const cylinderEnd1 = cylinderCenter.clone().addScaledVector(cylinderUpVector, height / 2);
                const cylinderEnd2 = cylinderCenter.clone().addScaledVector(cylinderUpVector, -height / 2);

                // Project player center onto cylinder axis
                const toPlayer = new Vector3().subVectors(playerCenter, cylinderEnd1);
                const axisLine = new Vector3().subVectors(cylinderEnd2, cylinderEnd1);
                const axisLength = axisLine.length();
                const axisNormalized = axisLine.clone().normalize();

                // Projection calculation
                const projectionLength = toPlayer.dot(axisNormalized);
                const projectionPoint = new Vector3().copy(cylinderEnd1).addScaledVector(axisNormalized, projectionLength);

                // Check if projection is within cylinder length
                const withinCylinderLength = projectionLength >= 0 && projectionLength <= axisLength;

                // Distance from player to nearest point on cylinder axis
                let distanceToAxis;
                let collisionNormal;
                let collisionPoint;

                if (withinCylinderLength) {
                    // Player is alongside the cylinder body
                    // Get distance from player to axis
                    distanceToAxis = new Vector3().subVectors(playerCenter, projectionPoint).length();

                    if (distanceToAxis < radius + playerSphere.radius) {
                        // Collision with cylinder side
                        collisionNormal = new Vector3().subVectors(playerCenter, projectionPoint).normalize();
                        collisionPoint = projectionPoint.clone().addScaledVector(collisionNormal, radius);
                        setCollisionNormal(collisionNormal);
                        setCollisionType("cylinder-side");
                        isColliding = true;
                        break;
                    }
                } else {
                    // Player is beyond the cylinder ends
                    // Find nearest end point
                    const endPoint = projectionLength < 0 ? cylinderEnd1 : cylinderEnd2;

                    // Check distance to end point (to see if we hit the cap)
                    const distanceToEnd = new Vector3().subVectors(playerCenter, endPoint).length();

                    if (distanceToEnd < radius + playerSphere.radius) {
                        // End cap collision
                        collisionNormal = new Vector3().subVectors(playerCenter, endPoint).normalize();
                        collisionPoint = endPoint.clone().addScaledVector(collisionNormal, radius);

                        // Determine if it's top or bottom
                        const isEnd1 = endPoint.equals(cylinderEnd1);
                        setCollisionNormal(collisionNormal);
                        setCollisionType(isEnd1 ? "cylinder-top" : "cylinder-bottom");
                        isColliding = true;
                        break;
                    }
                }
            }
            else {
                // Handle box collision (your existing code)
                const obstacleBox = new Box3().setFromObject(obstacle);

                if (playerBox.intersectsBox(obstacleBox)) {
                    setCollisionType("box")
                    let collisionNormal = new Vector3(0, 0, 0);

                    let obstacleCenter = new Vector3();
                    obstacleBox.getCenter(obstacleCenter);

                    // Calculate overlap on each axis
                    const playerMin = playerBox.min;
                    const playerMax = playerBox.max;
                    const obstacleMin = obstacleBox.min;
                    const obstacleMax = obstacleBox.max;

                    // Calculate penetration depth on each axis
                    const overlapX = Math.min(playerMax.x - obstacleMin.x, obstacleMax.x - playerMin.x);
                    const overlapY = Math.min(playerMax.y - obstacleMin.y, obstacleMax.y - playerMin.y);
                    const overlapZ = Math.min(playerMax.z - obstacleMin.z, obstacleMax.z - playerMin.z);

                    // The collision normal should be along the axis with the smallest penetration
                    if (overlapX <= overlapY && overlapX <= overlapZ) {
                        // X-axis has smallest penetration
                        collisionNormal.set(Math.sign(playerCenter.x - obstacleCenter.x), 0, 0);
                    } else if (overlapY <= overlapX && overlapY <= overlapZ) {
                        // Y-axis has smallest penetration
                        collisionNormal.set(0, Math.sign(playerCenter.y - obstacleCenter.y), 0);
                    } else {
                        // Z-axis has smallest penetration
                        collisionNormal.set(0, 0, Math.sign(playerCenter.z - obstacleCenter.z));
                    }

                    setCollisionNormal(collisionNormal);
                    isColliding = true;
                    break;
                }
            }
        }
        setColliding(isColliding);

        // Return a cleanup function if needed
    };


    const handlePositionAndCameraChange = React.useCallback((pos: Vector3, velocity: Vector3, cameraDirection: Vector3) => {
        socket.emit("updatePositionAndCamera", pos, velocity, cameraDirection);
    }, []);



    const handleFireballShoot = () => {
        if (!playerRef.current) return;

        const startPosition = playerRef.current.position.clone();

        const cameraDirection = new Vector3();
        camera.getWorldDirection(cameraDirection);
        const newFireball = {
            id: Date.now(),
            position: startPosition, // Player's position
            direction: cameraDirection, // Forward direction
        };
        setFireballs((prev) => [...prev, newFireball]);

    };


    const handleExplosion = (position: Vector3) => {

        const id = Date.now();
        setFireballs((prev) => prev.slice(1)); // Remove the first fireball
        setExplosions((prev) => [...prev, { id, position }]);

        const sound = new Howl({
            src: ['/sounds/explosion.mp3'],
            volume: 1,
        })
        sound.play();

        // Remove explosion after a second
        setTimeout(() => {
            setExplosions((prev) => prev.filter((exp) => exp.id !== id));

        }, 1000);
    };

    const velocity = useRef<Vector3>(new Vector3());
    const direction = useRef<Vector3>(new Vector3());
    const [moveState, setMoveState] = useState({
        forward: false,
        backward: false,
        left: false,
        right: false
    });





    // Handle keyboard input
    useEffect(() => {
        let shootingInterval: NodeJS.Timeout | null = null;

        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.code) {
                case 'KeyW': setMoveState(prev => ({ ...prev, forward: true })); break;
                case 'KeyS': setMoveState(prev => ({ ...prev, backward: true })); break;
                case 'KeyA': setMoveState(prev => ({ ...prev, left: true })); break;
                case 'KeyD': setMoveState(prev => ({ ...prev, right: true })); break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    playerSpeed.current = 18;
                    break;
                case 'KeyG': {
                    if (!grenadeCoolDownRef.current) {
                        handleFireballShoot();
                        grenadeCoolDownRef.current = true;
                        setTimeout(() => {
                            grenadeCoolDownRef.current = false;
                        }, 5000); // 5 second cooldown
                    }
                    break;
                }
                case 'Space':
                    jumpRequested.current = true;
                    break;
            }


        };

        const handleKeyUp = (e: KeyboardEvent) => {
            switch (e.code) {
                case 'KeyW': setMoveState(prev => ({ ...prev, forward: false })); break;
                case 'KeyS': setMoveState(prev => ({ ...prev, backward: false })); break;
                case 'KeyA': setMoveState(prev => ({ ...prev, left: false })); break;
                case 'KeyD': setMoveState(prev => ({ ...prev, right: false })); break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    playerSpeed.current = 6;
                    break;
                case 'Space':
                    jumpRequested.current = false;
                    break;
            }
        };

        const handleMouseDown = () => {
            if (!shootingInterval) {
                handleShoot(); // Call immediately on click
                shootingInterval = setInterval(() => {
                    handleShoot();
                }, 150);
                shootEvent.current.emit("start");
            }
        };


        const handleMouseUp = () => {
            if (shootingInterval) {
                clearInterval(shootingInterval);
                shootingInterval = null;
                shootEvent.current.emit("stop");
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('keyup', handleKeyUp);
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('mouseup', handleMouseUp);

            if (shootingInterval) {
                clearInterval(shootingInterval);
            }
        };
    }, []);


    // Add state to track camera angles
    const cameraAngles = useRef({ horizontal: 0, vertical: 0 });

    // Simple third-person mouse controls - always active, no locking
    useEffect(() => {
        interface MouseMoveEvent extends MouseEvent {
            movementX: number;
            movementY: number;
        }

        interface CameraAngles {
            horizontal: number;
            vertical: number;
        }

        const handleMouseMove = (event: MouseMoveEvent) => {
            const sensitivity: number = 0.002;

            // Always update camera angles when mouse moves
            (cameraAngles.current as CameraAngles).horizontal -= event.movementX * sensitivity;
            (cameraAngles.current as CameraAngles).vertical += event.movementY * sensitivity;

            // Clamp vertical angle
            const maxVerticalAngle: number = Math.PI / 3;
            const minVerticalAngle: number = -Math.PI / 6;
            (cameraAngles.current as CameraAngles).vertical = Math.max(
                minVerticalAngle,
                Math.min(maxVerticalAngle, (cameraAngles.current as CameraAngles).vertical)
            );
        };

        // Just listen to mouse movement - that's it!
        document.addEventListener('mousemove', handleMouseMove);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    // Move player based on keyboard input and check collisions
    useFrame((_, delta) => {
        // Removed the controlsRef check since PointerLockControls is disabled
        // if (!controlsRef?.current?.isLocked) return;

        // Get ground height for the player
        const groundY = getGroundHeight(playerPosition.current.x, playerPosition.current.z);
        const onGround = playerPosition.current.y <= groundY + playerHeight + 1;

        // Calculate movement direction based on camera orientation
        direction.current.z = Number(moveState.backward) - Number(moveState.forward);
        direction.current.x = Number(moveState.right) - Number(moveState.left);
        direction.current.normalize();


        const cameraDistance = 6; // Distance behind/around player
        const cameraHeight = 0.05; // Base height above player
        const smoothingFactor = 0.5; // Camera smoothing

        // Get player head position
        const playerHeadPosition = playerPosition.current.clone().add(new Vector3(0, playerHeight, 0));

        // Calculate camera position using spherical coordinates from mouse angles
        const horizontalAngle = cameraAngles.current.horizontal;
        const verticalAngle = cameraAngles.current.vertical;

        // Convert spherical coordinates to cartesian for camera offset
        const cameraOffset = new Vector3(
            Math.sin(horizontalAngle) * Math.cos(verticalAngle) * cameraDistance,
            Math.sin(verticalAngle) * cameraDistance + cameraHeight,
            Math.cos(horizontalAngle) * Math.cos(verticalAngle) * cameraDistance
        );

        const idealCameraPosition = playerHeadPosition.clone().add(cameraOffset);

        // Smooth camera movement
        camera.position.lerp(idealCameraPosition, smoothingFactor);

        // Handle camera collision with obstacles
        const raycaster = new Raycaster();
        const rayDirection = cameraOffset.clone().normalize();
        raycaster.set(playerHeadPosition, rayDirection);

        const intersects = raycaster.intersectObjects(obstacles, true);
        if (intersects.length > 0 && intersects[0].distance < cameraDistance) {
            // Pull camera closer if there's an obstacle
            const safeDistance = Math.max(intersects[0].distance * 0.9, 0.5);
            const adjustedOffset = rayDirection.clone().multiplyScalar(safeDistance);
            adjustedOffset.y += cameraHeight;
            camera.position.copy(playerHeadPosition.clone().add(adjustedOffset));
        }

        // Make camera look at player
        camera.lookAt(playerHeadPosition);

        // 4. UPDATE movement to use camera direction
        // Replace your existing movement calculation with this:

        // Get movement direction from camera horizontal angle
        const forwardDirection = new Vector3(
            Math.sin(cameraAngles.current.horizontal),
            0,
            Math.cos(cameraAngles.current.horizontal)
        );
        const rightDirection = new Vector3(
            Math.cos(cameraAngles.current.horizontal),
            0,
            -Math.sin(cameraAngles.current.horizontal)
        );

        // Calculate movement vector
        const moveVector = new Vector3();
        moveVector.addScaledVector(forwardDirection, direction.current.z); // forward/backward
        moveVector.addScaledVector(rightDirection, direction.current.x); // left/right
        moveVector.normalize();

        const horizontalMove = moveVector.multiplyScalar(playerSpeed.current * delta);

        // Apply horizontal movement to player position
        const previousPosition = playerPosition.current.clone();
        playerPosition.current.x += horizontalMove.x;
        playerPosition.current.z += horizontalMove.z;


        // Handle gravity and jumping
        if (!onGround) {
            playerVelocity.current.y += gravity * delta;
        } else if (jumpRequested.current) {
            playerVelocity.current.y = jumpStrength;
            isJumpingRef.current = true;
            jumpRequested.current = false;
        }

        // Apply vertical movement
        playerPosition.current.y += playerVelocity.current.y * delta;

        // Ground collision
        if (playerPosition.current.y < groundY + playerHeight) {
            isJumpingRef.current = false;
            playerPosition.current.y = groundY + playerHeight;
            playerVelocity.current.y = 0;
        }

        // Check collisions with obstacles
        checkCollisions(playerPosition.current);

        // Handle collisions
        if (colliding && collisionNormal) {
            const normal = collisionNormal.clone().normalize();
            const isOnTop = normal.y > 0.7;

            if (collisionType === "sphere" || collisionType === "cylinder-top" || (collisionType === "box" && isOnTop)) {
                // Handle standing on top of objects
                if (jumpRequested.current) {
                    playerVelocity.current.y = jumpStrength;
                    isJumpingRef.current = true;
                    jumpRequested.current = false;
                }
                playerPosition.current.y = Math.max(playerPosition.current.y, groundY + playerHeight);
                playerVelocity.current.y = 0;
            } else {
                // Handle side collisions
                playerPosition.current.copy(previousPosition);
                const slideVector = horizontalMove.clone().projectOnPlane(normal);
                const pushDistance = 0.001;
                playerPosition.current.addScaledVector(normal, pushDistance);
                playerPosition.current.add(slideVector);
            }
        }

        // Update player position and rotation
        if (playerRef.current) {
            playerRef.current.position.copy(playerPosition.current);
            if (horizontalMove.length() > 0.01) {
                const moveDirection = horizontalMove.clone().normalize();
                const targetRotation = Math.atan2(moveDirection.x, moveDirection.z);
                const currentRotation = playerRef.current.rotation.y;
                const rotationDiff = ((targetRotation - currentRotation + Math.PI) % (2 * Math.PI)) - Math.PI;
                playerRef.current.rotation.y += rotationDiff * 10 * delta;
            }
        }

        // Update player position for networking
        const cameraDirection = new Vector3();

        const currentTime = performance.now();
        if (currentTime - lastUpdateTime.current >= 100) {

            camera.getWorldDirection(cameraDirection);

            handlePositionAndCameraChange(playerPosition.current.clone(), playerVelocity.current.clone(), cameraDirection);
            onCenterUpdate(playerPosition.current.clone());

            lastUpdateTime.current = currentTime;
        }


    });

    return (
        <>

            {fireballs.map((fireball) => (
                <Fireball
                    key={fireball.id}
                    position={fireball.position}
                    getGroundHeight={getGroundHeight}
                    direction={fireball.direction}
                    obstacles={obstacles || []} // Pass obstacle references here
                    onExplode={handleExplosion}
                />
            ))}

            {explosions.map((explosion) => (
                <Explosion key={explosion.id} position={explosion.position} explosionRadius={15} />
            ))}
            <group ref={playerRef} position={playerPosition.current}>
                {/* Player body */}
                <mesh position={[0, -1, 0]}>
                    <sphereGeometry args={[0.5]} />
                    <meshStandardMaterial color="skyblue" />
                </mesh>

                {/* Gun (attached to player's right hand) */}
                <Gun
                    camera={camera}
                    ammoRef={ammoRef}
                    shootEvent={shootEvent.current}
                    pingRef={pingRef}
                    userId={userId}
                    obstacles={obstacles}
                />
            </group>
        </>
    );
};

export default Player;