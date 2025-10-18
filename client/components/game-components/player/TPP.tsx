// Key changes to add to your Player component:

import React, { useRef, useState, useEffect, RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber'
import socket from '@/lib/socket';
import { Howl } from 'howler';
import Explosion from '../explosion/Explosion';
import Gun from './Gun';
import { Vector3, Mesh, Camera, Raycaster, AudioListener } from 'three';
import { checkCollisions } from './checkCollision';
import { CollisionType } from './checkCollision';

//hooks
import { useAudioListener } from '@/hooks/useAudioListener';
import { usePlayerInput } from '@/hooks/usePlayerInput';
import { useRoomStore } from '@/hooks/useRoomStore';

import { PLAYER_RADIUS } from '@/types/types';


interface PlayerProps {
    obstacles: any;
    handlePlayerCenterUpdate: (center: Vector3, cameraDirection: Vector3) => void;
    playerCenterRef: RefObject<Vector3>;
    pingRef: RefObject<number>;
    crosshairRef: RefObject<{ triggerHit: () => void }>;
    grenadeCoolDownRef: RefObject<boolean>;
    getGroundHeight: (x: number, z: number) => number;
    otherPlayers: RefObject<{ [playerId: string]: { position: Vector3; velocity: Vector3 } }>;
    controlsRef: RefObject<any>;
    playerDeadRef: RefObject<boolean>;
    roomId: string;
    userId: string;
    listenerRef: RefObject<AudioListener | null>;
}


type GunProps = {
    camera: Camera
}


const Player: React.FC<PlayerProps> = ({
    obstacles,
    handlePlayerCenterUpdate,
    playerCenterRef,
    playerDeadRef, controlsRef,
    crosshairRef,
    getGroundHeight,
    grenadeCoolDownRef,
    otherPlayers,
    roomId,
    userId,
    listenerRef
}) => {

    const [isFPS, setIsFPS] = useState(false);

    const { camera } = useThree();
    const collidingRef = useRef(false);
    const collisionNormalRef = useRef<Vector3 | null>(null);
    const jumpRequested = useRef(false);
    const playerRef = useRef<Mesh>(null);
    const isJumpingRef = useRef(false);
    const [fireballs, setFireballs] = useState<{ id: number; position: Vector3; direction: Vector3 }[]>([]);
    const collisionTypeRef = useRef<CollisionType>("");
    const [explosions, setExplosions] = useState<{ id: number; position: Vector3 }[]>([]);
    const lastUpdateTime = useRef(0);
    const walkSoundRef = useRef<Howl | null>(null);
    const wasWalkingRef = useRef(false);

    // NEW: Rebound system refs
    const reboundVelocity = useRef<Vector3>(new Vector3());
    const inputBlockedUntil = useRef<number>(0);
    const lastCollisionTime = useRef<number>(0);

    const rand = () => Math.random() * 100 + 100;

    const spawnPoint = useRoomStore.getState().spawnPoint;

    const playerPosition = useRef<Vector3>(
        spawnPoint ? new Vector3(spawnPoint.x, spawnPoint.y, spawnPoint.z) : new Vector3(0, 0, 0)
    );
    const playerVelocity = useRef<Vector3>(new Vector3());
    const playerSpeed = useRef(10);
    const playerHeight = 3;
    const gravity = -9.8 * 4;
    const jumpStrength = 25;

    const horizontalVelocity = useRef<Vector3>(new Vector3(0, 0, 0));

    // Movement constants
    const BASE_SPEED = 6;
    const SPRINT_SPEED = 30;
    const ACCELERATION = 20;
    const DECELERATION = 70;
    const DIRECTION_CHANGE_DECELERATION = 120;

    // NEW: Rebound constants
    const REBOUND_STRENGTH = 30; // Initial bounce-back force
    const REBOUND_DECAY = 0.88; // How quickly rebound loses strength (higher = slower decay)
    const INPUT_BLOCK_DURATION = 0.4; // Seconds to block input after collision
    const COLLISION_COOLDOWN = 0.15; // Minimum time between collision rebounds

    const keysPressedRef = useRef<{ [key: string]: boolean }>({
        KeyW: false,
        KeyA: false,
        KeyS: false,
        KeyD: false,
        ShiftLeft: false,
        ShiftRight: false,
    });

    useAudioListener(camera, listenerRef);

    const result = checkCollisions(playerPosition.current, obstacles);
    collidingRef.current = result.isColliding;
    collisionNormalRef.current = result.collisionNormal;
    collisionTypeRef.current = result.collisionType;

    const handlePositionAndCameraChange = React.useCallback((pos: Vector3, velocity: Vector3, cameraDirection: Vector3) => {
        socket.emit("updatePositionAndCamera", pos, velocity, cameraDirection, roomId);
    }, []);

    const handleFireballShoot = () => {
        if (!playerRef.current) return;

        const startPosition = playerRef.current.position.clone();

        const cameraDirection = new Vector3();
        camera.getWorldDirection(cameraDirection);
        const newFireball = {
            id: Date.now(),
            position: startPosition,
            direction: cameraDirection,
        };
        setFireballs((prev) => [...prev, newFireball]);
    };

    const direction = useRef<Vector3>(new Vector3());
    const [moveState, setMoveState] = useState({
        forward: false,
        backward: false,
        left: false,
        right: false
    });

    // Handle keyboard input
    usePlayerInput({
        onJump: () => { jumpRequested.current = true; },
        onSprintStart: () => { keysPressedRef.current.ShiftLeft = true; },
        onSprintEnd: () => { keysPressedRef.current.ShiftLeft = false; },
        onGrenade: () => {
            if (!grenadeCoolDownRef.current) {
                handleFireballShoot();
                grenadeCoolDownRef.current = true;
                setTimeout(() => (grenadeCoolDownRef.current = false), 5000);
            }
        },
        onRightMouseDown: () => {
            setIsFPS(true);
        },
        onRightMouseUp: () => {
            setIsFPS(false)
        },
        onLeftMouseDown() { },
        onLeftMouseUp() { },
        setMoveState,
    });

    const cameraAngles = useRef({ horizontal: 0, vertical: 0 });

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
            const sensitivity: number = 0.004;

            (cameraAngles.current as CameraAngles).horizontal -= event.movementX * sensitivity;
            (cameraAngles.current as CameraAngles).vertical += event.movementY * sensitivity;

            const maxVerticalAngle: number = Math.PI / 2;
            const minVerticalAngle: number = -Math.PI / 2;
            (cameraAngles.current as CameraAngles).vertical = Math.max(
                minVerticalAngle,
                Math.min(maxVerticalAngle, (cameraAngles.current as CameraAngles).vertical)
            );
        };

        document.addEventListener('mousemove', handleMouseMove);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    //respawn logic
    useEffect(() => {
        let lastState = playerDeadRef.current;

        const interval = setInterval(() => {
            if (lastState && !playerDeadRef.current) {
                const otherPlayerList = Object.values(otherPlayers.current);
                console.log("Respawning player, other players:", otherPlayerList);
                const MIN_DISTANCE = 100;
                const MAX_DISTANCE = 200;
                const MAX_ATTEMPTS = 30;

                const getValidSpawn = () => {
                    for (let i = 0; i < MAX_ATTEMPTS; i++) {
                        const base = otherPlayerList[Math.floor(Math.random() * otherPlayerList.length)]?.position;
                        if (!base) continue;

                        const angle = Math.random() * Math.PI * 2;
                        const distance = MIN_DISTANCE + Math.random() * (MAX_DISTANCE - MIN_DISTANCE);
                        const offsetX = Math.cos(angle) * distance;
                        const offsetZ = Math.sin(angle) * distance;
                        const newX = base.x + offsetX;
                        const newZ = base.z + offsetZ;
                        const newY = getGroundHeight(newX, newZ) + playerHeight;

                        const candidate = new Vector3(newX, newY, newZ);

                        const safe = otherPlayerList.every(p => p.position.distanceTo(candidate) >= MIN_DISTANCE);
                        if (safe) return candidate;
                    }
                    return new Vector3(100, getGroundHeight(100, 100) + playerHeight, 100);
                };

                const spawnPos = getValidSpawn();
                playerPosition.current.copy(spawnPos);
                if (playerRef.current) playerRef.current.position.copy(spawnPos);
                playerVelocity.current.set(0, 0, 0);
            }

            lastState = playerDeadRef.current;
        }, 100);

        return () => clearInterval(interval);
    }, []);

    //walk sound initialization
    useEffect(() => {
        walkSoundRef.current = new Howl({
            src: ['/sounds/walks.mp3'],
            volume: 0.5,
            loop: true,
            rate: 1
        });

        return () => {
            walkSoundRef.current?.stop();
        };
    }, []);

    // Move player based on keyboard input and check collisions
    useFrame((_, delta) => {

        if (playerDeadRef.current) return;

        const currentTime = performance.now() / 1000; // Convert to seconds

        // Get ground height for the player
        const groundY = getGroundHeight(playerPosition.current.x, playerPosition.current.z);
        const onGround = playerPosition.current.y <= groundY + playerHeight + 1;

        // NEW: Check if input is blocked
        const isInputBlocked = currentTime < inputBlockedUntil.current;

        // Calculate movement direction based on camera orientation
        // Only apply input if not blocked
        if (!isInputBlocked) {
            direction.current.z = Number(moveState.backward) - Number(moveState.forward);
            direction.current.x = Number(moveState.right) - Number(moveState.left);
            direction.current.normalize();
        } else {
            // Input is blocked - zero out direction
            direction.current.set(0, 0, 0);
        }

        // Get player head position
        const playerHeadPosition = playerPosition.current.clone().add(new Vector3(0, playerHeight, 0));

        if (isFPS) {
            const horizontalAngle = cameraAngles.current.horizontal;
            const verticalAngle = cameraAngles.current.vertical;

            const eyeOffsetY = -2.5;
            const eye = playerHeadPosition.clone();
            eye.y += eyeOffsetY;

            camera.position.copy(eye);

            const forward = new Vector3(
                -Math.sin(horizontalAngle) * Math.cos(verticalAngle),
                -Math.sin(verticalAngle),
                -Math.cos(horizontalAngle) * Math.cos(verticalAngle)
            ).normalize();

            camera.lookAt(eye.clone().add(forward));

            const zoomAmount = 2;
            camera.position.copy(eye.clone().add(forward.clone().multiplyScalar(zoomAmount)));

        } else {
            const cameraDistance = 6;
            const cameraHeight = 0;
            const smoothingFactor = 0.5;

            const horizontalAngle = cameraAngles.current.horizontal;
            const verticalAngle = cameraAngles.current.vertical;

            const cameraOffset = new Vector3(
                Math.sin(horizontalAngle) * Math.cos(verticalAngle) * cameraDistance,
                Math.sin(verticalAngle) * cameraDistance + cameraHeight,
                Math.cos(horizontalAngle) * Math.cos(verticalAngle) * cameraDistance
            );

            const idealCameraPosition = playerHeadPosition.clone().add(cameraOffset);

            camera.position.lerp(idealCameraPosition, smoothingFactor);

            const raycaster = new Raycaster();
            const rayDirection = cameraOffset.clone().normalize();
            raycaster.set(playerHeadPosition, rayDirection);

            const intersects = raycaster.intersectObjects(obstacles, true);
            if (intersects.length > 0 && intersects[0].distance < cameraDistance) {
                const safeDistance = Math.max(intersects[0].distance * 0.9, 0.5);
                const adjustedOffset = rayDirection.clone().multiplyScalar(safeDistance);
                adjustedOffset.y += cameraHeight;
                camera.position.copy(playerHeadPosition.clone().add(adjustedOffset));
            }

            camera.lookAt(playerHeadPosition);
        }

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
        moveVector.addScaledVector(forwardDirection, direction.current.z);
        moveVector.addScaledVector(rightDirection, direction.current.x);
        moveVector.normalize();

        const targetSpeed = keysPressedRef.current.ShiftLeft ? SPRINT_SPEED : BASE_SPEED;

        const desiredVelocity = new Vector3();
        if (moveVector.length() > 0 && !isInputBlocked) {
            moveVector.normalize();
            desiredVelocity.copy(moveVector).multiplyScalar(targetSpeed);
        }

        const currentSpeed = horizontalVelocity.current.length();

        if (desiredVelocity.length() > 0 && !isInputBlocked) {
            if (currentSpeed > 0) {
                const currentDirection = horizontalVelocity.current.clone().normalize();
                const desiredDirection = desiredVelocity.clone().normalize();
                const dot = currentDirection.dot(desiredDirection);

                if (dot < 0.2) {
                    const decelerationRate = DIRECTION_CHANGE_DECELERATION * delta;
                    horizontalVelocity.current.multiplyScalar(Math.max(0, 1 - decelerationRate));
                }
            }

            const velocityDiff = desiredVelocity.clone().sub(horizontalVelocity.current);
            const accelerationAmount = ACCELERATION * delta;

            if (velocityDiff.length() > accelerationAmount) {
                velocityDiff.normalize().multiplyScalar(accelerationAmount);
            }

            horizontalVelocity.current.add(velocityDiff);
        } else {
            const decelerationRate = DECELERATION * delta;
            horizontalVelocity.current.multiplyScalar(Math.max(0, 1 - decelerationRate));
        }

        // NEW: Apply rebound velocity
        const totalVelocity = horizontalVelocity.current.clone().add(reboundVelocity.current);

        // Apply horizontal movement to player position
        const previousPosition = playerPosition.current.clone();
        playerPosition.current.x += totalVelocity.x * delta;
        playerPosition.current.z += totalVelocity.z * delta;

        // NEW: Decay rebound velocity
        reboundVelocity.current.multiplyScalar(REBOUND_DECAY);

        // Stop rebound when it's negligible
        if (reboundVelocity.current.length() < 0.1) {
            reboundVelocity.current.set(0, 0, 0);
        }

        const horizontalMove = moveVector.multiplyScalar(playerSpeed.current * delta);

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
        const result = checkCollisions(playerPosition.current, obstacles);
        collidingRef.current = result.isColliding;
        collisionNormalRef.current = result.collisionNormal;
        collisionTypeRef.current = result.collisionType;

        // Handle collisions
        if (collidingRef.current && collisionNormalRef.current) {
            const normal = collisionNormalRef.current.clone().normalize();
            const isOnTop = normal.y > 0.7;

            if (collisionTypeRef.current === "sphere" || collisionTypeRef.current === "cylinder-top" || (collisionTypeRef.current === "box" && isOnTop)) {
                // Handle standing on top of objects
                if (jumpRequested.current) {
                    playerVelocity.current.y = jumpStrength;
                    isJumpingRef.current = true;
                    jumpRequested.current = false;
                }
                playerPosition.current.y = Math.max(playerPosition.current.y, groundY + playerHeight);
                playerVelocity.current.y = 0;
            } else {
                // NEW: Enhanced side collision with rebound
                playerPosition.current.copy(previousPosition);

                // Only trigger rebound if cooldown has passed
                const timeSinceLastCollision = currentTime - lastCollisionTime.current;
                if (timeSinceLastCollision > COLLISION_COOLDOWN) {
                    // Calculate rebound direction (opposite to collision normal)
                    const reboundDirection = normal.clone().multiplyScalar(REBOUND_STRENGTH);

                    // Set the rebound velocity
                    reboundVelocity.current.copy(reboundDirection);

                    // Clear horizontal velocity to stop forward momentum
                    horizontalVelocity.current.set(0, 0, 0);

                    // Block input temporarily
                    inputBlockedUntil.current = currentTime + INPUT_BLOCK_DURATION;

                    // Update last collision time
                    lastCollisionTime.current = currentTime;

                    const collisionSound = new Howl({
                        src: ['/sounds/hitwood.mp3'], // Update with your sound file path
                        volume: 0.1,
                    });
                    collisionSound.play();
                }
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

        const networkUpdateTime = performance.now();
        if (networkUpdateTime - lastUpdateTime.current >= 0) {

            camera.getWorldDirection(cameraDirection);

            handlePositionAndCameraChange(playerPosition.current.clone(), playerVelocity.current.clone(), cameraDirection);
            handlePlayerCenterUpdate(playerPosition.current.clone(), cameraDirection.clone());

            lastUpdateTime.current = networkUpdateTime;
        }

        //walk sound logic
        const START_WALK_THRESHOLD = 0.01;
        const STOP_WALK_THRESHOLD = 0.001;

        const velocitySq = horizontalMove.lengthSq();

        let nowWalking = wasWalkingRef.current;

        if (!wasWalkingRef.current && velocitySq > START_WALK_THRESHOLD) {
            nowWalking = true;
        } else if (wasWalkingRef.current && velocitySq < STOP_WALK_THRESHOLD) {
            nowWalking = false;
        }

        const isWalkingNow = nowWalking && onGround && !playerDeadRef.current;

        const walkSound = walkSoundRef.current;

        if (walkSound) {
            const isShift = keysPressedRef.current.ShiftLeft;

            if (isWalkingNow && !wasWalkingRef.current) {
                walkSound.volume(isShift ? 0.8 : 0.2);
                walkSound.rate(isShift ? 2 : 1);
                walkSound.play();
                socket.emit("playerWalking", { userId });
            } else if (!isWalkingNow && wasWalkingRef.current) {
                walkSound.stop();
                socket.emit("playerStopped", { userId });
            } else if (isWalkingNow && walkSound.playing()) {
                walkSound.volume(isShift ? 0.8 : 0);
                walkSound.rate(isShift ? 2 : 0);
            }

            wasWalkingRef.current = isWalkingNow;
        }
    });

    return (
        <>
            {explosions.map((explosion) => (
                <Explosion key={explosion.id} position={explosion.position} explosionRadius={15} />
            ))}
            <group ref={playerRef} position={playerPosition.current}>
                {/* Player body */}
                <mesh position={[0, -1.5, 0]}>
                    <sphereGeometry args={[PLAYER_RADIUS]} />
                    <meshStandardMaterial color="skyblue" />
                </mesh>

                {/* Gun (attached to player's right hand) */}
                <Gun
                    roomId={roomId}
                    camera={camera}
                    userId={userId}
                    obstacles={obstacles}
                    playerCenterRef={playerCenterRef}
                    getGroundHeight={getGroundHeight}
                    otherPlayers={otherPlayers}
                    crosshairRef={crosshairRef}
                />
            </group>
        </>
    );
};

export default Player;