// Player component
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


interface PlayerProps {
    obstacles: any;
    onCenterUpdate: (center: Vector3, cameraDirection: Vector3) => void;
    playerCenterRef: RefObject<Vector3>;
    pingRef: RefObject<number>;
    crosshairRef: RefObject<{ triggerHit: () => void }>;
    grenadeCoolDownRef: RefObject<boolean>;
    getGroundHeight: (x: number, z: number) => number;
    otherPlayers: RefObject<{ [playerId: string]: { position: Vector3; velocity: Vector3 } }>;
    controlsRef: RefObject<any>;
    playerDeadRef: RefObject<boolean>;
    userId: string;
    listenerRef: RefObject<AudioListener | null>;
}


type GunProps = {
    camera: Camera
}


const Player: React.FC<PlayerProps> = ({
    obstacles,
    onCenterUpdate,
    playerCenterRef,
    playerDeadRef, controlsRef,
    crosshairRef,
    getGroundHeight,
    grenadeCoolDownRef,
    otherPlayers,
    pingRef,
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
    const wasWalkingRef = useRef(false); // to track last frame walking state

    const rand = () => Math.random() * 100 + 100;

    const playerPosition = useRef<Vector3>(new Vector3(0, 0, 0));
    const playerVelocity = useRef<Vector3>(new Vector3());
    const playerSpeed = useRef(10);
    const playerHeight = 3;
    const gravity = -9.8 * 4;
    const jumpStrength = 25;

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

    /** Work on explosion damage synced with server */
    // const handleExplosion = (position: Vector3) => {

    //     const id = Date.now();
    //     setFireballs((prev) => prev.slice(1)); // Remove the first fireball
    //     setExplosions((prev) => [...prev, { id, position }]);

    //     const sound = new Howl({
    //         src: ['/sounds/explosion.mp3'],
    //         volume: 1,
    //     })
    //     sound.play();

    //     // Remove explosion after a second
    //     setTimeout(() => {
    //         setExplosions((prev) => prev.filter((exp) => exp.id !== id));

    //     }, 1000);
    // };

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
        onSprintStart: () => { keysPressedRef.current.ShiftLeft = true; playerSpeed.current = 18; },
        onSprintEnd: () => { keysPressedRef.current.ShiftLeft = false; playerSpeed.current = 6; },
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
        onLeftMouseDown: () => { },
        onMouseUp: () => {
            setIsFPS(false);
        },
        setMoveState,
    });



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
            const sensitivity: number = 0.004;

            // Always update camera angles when mouse moves
            (cameraAngles.current as CameraAngles).horizontal -= event.movementX * sensitivity;
            (cameraAngles.current as CameraAngles).vertical += event.movementY * sensitivity;

            // Clamp vertical angle
            const maxVerticalAngle: number = Math.PI * 3;
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


    //respawn logic
    useEffect(() => {
        let lastState = playerDeadRef.current;

        const interval = setInterval(() => {
            if (lastState && !playerDeadRef.current) {
                // Player just respawned
                const otherPlayerList = Object.values(otherPlayers.current);
                console.log("Respawning player, other players:", otherPlayerList);
                const MIN_DISTANCE = 20;
                const MAX_DISTANCE = 50;
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
                    return new Vector3(100, getGroundHeight(100, 100) + playerHeight, 100); // fallback
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

        if (playerDeadRef.current) return; // Skip if player is dead

        // Removed the controlsRef check since PointerLockControls is disabled
        // if (!controlsRef?.current?.isLocked) return;

        // Get ground height for the player
        const groundY = getGroundHeight(playerPosition.current.x, playerPosition.current.z);
        const onGround = playerPosition.current.y <= groundY + playerHeight + 1;

        // Calculate movement direction based on camera orientation
        direction.current.z = Number(moveState.backward) - Number(moveState.forward);
        direction.current.x = Number(moveState.right) - Number(moveState.left);
        direction.current.normalize();


        // Get player head position
        const playerHeadPosition = playerPosition.current.clone().add(new Vector3(0, playerHeight, 0));

        if (isFPS) {


            const horizontalAngle = cameraAngles.current.horizontal;
            const verticalAngle = cameraAngles.current.vertical;

            // Position camera at the head (slightly offset optional to avoid clipping)
            const eyeOffsetY = -2.5; // tweak if needed (e.g., 0.1)
            const eye = playerHeadPosition.clone();
            eye.y += eyeOffsetY;

            camera.position.copy(eye);

            // Compute forward direction from angles
            const forward = new Vector3(
                -Math.sin(horizontalAngle) * Math.cos(verticalAngle),
                -Math.sin(verticalAngle),
                -Math.cos(horizontalAngle) * Math.cos(verticalAngle)
            ).normalize();

            // Look direction
            camera.lookAt(eye.clone().add(forward));


        } else {
            // Third-person as before
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

            // Smooth camera movement
            camera.position.lerp(idealCameraPosition, smoothingFactor);

            // Handle camera collision (ray from head toward camera offset)
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
            onCenterUpdate(playerPosition.current.clone(), cameraDirection.clone());

            lastUpdateTime.current = currentTime;
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
                // Update rate and volume dynamically if needed while walking
                walkSound.volume(isShift ? 0.8 : 0);
                walkSound.rate(isShift ? 2 : 0);
            }

            wasWalkingRef.current = isWalkingNow;
        }
    });

    return (
        <>
            {/* work on them later when implementing fireballs */}
            {/* {fireballs.map((fireball) => (
                <Fireball
                    key={fireball.id}
                    position={fireball.position}
                    getGroundHeight={getGroundHeight}
                    direction={fireball.direction}
                    obstacles={obstacles || []} // Pass obstacle references here
                    onExplode={handleExplosion}
                />
            ))} */}

            {explosions.map((explosion) => (
                <Explosion key={explosion.id} position={explosion.position} explosionRadius={15} />
            ))}
            <group ref={playerRef} position={playerPosition.current}>
                {/* Player body */}
                <mesh position={[0, -1.5, 0]}>
                    <sphereGeometry args={[0.5]} />
                    <meshStandardMaterial color="skyblue" />
                </mesh>


                {/* Gun (attached to player's right hand) */}
                <Gun
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