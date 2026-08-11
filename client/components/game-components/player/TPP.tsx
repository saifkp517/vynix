// Key changes to add to your Player component:

import React, { useRef, useState, useEffect, RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber'
import socket from '@/lib/socket';
import { getLoopingSound, playSound } from '@/lib/sound';
import Explosion from '../explosion/Explosion';
import Gun from './Gun';
import { Vector3, Mesh, Camera, PerspectiveCamera, Raycaster, AudioListener, FogExp2, SphereGeometry } from 'three';
import { collectContacts, ellipsoidTopHeightAt } from './checkCollision';

//hooks
import { useAudioListener } from '@/hooks/useAudioListener';
import { usePlayerInput } from '@/hooks/usePlayerInput';
import { useRoomStore } from '@/hooks/useRoomStore';
import { useGameInfoStore } from '@/hooks/useGameInfoStore';

import { PLAYER_RADIUS } from '@/types/types';
import { ZOOM_LEVELS, zoomPercent } from '@/lib/scope';


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

    // Sniper scope: FOV-based zoom, stepped by scroll while aiming (isFPS).
    // Magnification is a discrete stop (not continuous) so the HUD readout
    // is stable and each scroll click feels intentional.
    // Stops and the MAX_ZOOM cap live in lib/scope.ts so the HUD can render the
    // same range as a percentage without ever exposing the magnification.
    const baseFovRef = useRef(75);
    const zoomIndexRef = useRef(0);
    const currentFovRef = useRef(75);
    const sensitivityScaleRef = useRef(1);
    const baseFogDensityRef = useRef<number | null>(null);
    const setScope = useGameInfoStore((state) => state.setScope);

    const { camera, scene } = useThree();
    const collidingRef = useRef(false);
    const collisionNormalRef = useRef<Vector3 | null>(null);
    const collisionObjectRef = useRef<Mesh | null>(null);
    const jumpRequested = useRef(false);
    const playerRef = useRef<Mesh>(null);
    const isJumpingRef = useRef(false);
    const [fireballs, setFireballs] = useState<{ id: number; position: Vector3; direction: Vector3 }[]>([]);
    // True while the player is resting on top of an obstacle (rock, ledge) as
    // opposed to terrain. Set during collision resolution, consumed by the
    // next frame's `onGround` test so gravity/jump treat an obstacle top as
    // real standable ground.
    const groundedOnObstacleRef = useRef(false);
    // Narrower than groundedOnObstacleRef: true only when the support is a
    // canopy dome, so jumping off one can get the CANOPY_JUMP_MULTIPLIER boost
    // while terrain and trunk tops keep the plain jumpStrength.
    const groundedOnCanopyRef = useRef(false);
    const [explosions, setExplosions] = useState<{ id: number; position: Vector3 }[]>([]);
    const lastUpdateTime = useRef(0);
    const wasWalkingRef = useRef(false);

    // Camera-only smoothed head position. The player's actual Y snaps to
    // getGroundHeight's noise every frame (needed for correct footing), but
    // following that raw value with the camera turns terrain noise into
    // visible high-frequency jitter. Low-pass filtering just the camera's
    // read of head position removes the jiggle without touching movement/
    // collision, which still use the true playerPosition.
    const smoothedHeadPosition = useRef<Vector3 | null>(null);

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
    // Jumping off a canopy launches you this much harder than off terrain,
    // so canopy-to-canopy hops are reachable without raising the base jump.
    const CANOPY_JUMP_MULTIPLIER = 1.2;

    const horizontalVelocity = useRef<Vector3>(new Vector3(0, 0, 0));

    // Movement constants
    const SPRINT_SPEED = 30;
    const ACCELERATION = 20;
    const DECELERATION = 70;
    const DIRECTION_CHANGE_DECELERATION = 120;

    // NEW: Rebound constants
    const REBOUND_STRENGTH = 30; // Initial bounce-back force
    const REBOUND_DECAY = 0.90; // How quickly rebound loses strength (higher = slower decay)
    const INPUT_BLOCK_DURATION = 0.4; // Seconds to block input after collision
    const COLLISION_COOLDOWN = 0.15; // Minimum time between collision rebounds

    // Collision constants
    // Radius of the player's collision capsule. Deliberately distinct from the
    // shared PLAYER_RADIUS (the hitbox/visual radius that shot detection and
    // opponent rendering use) — a slightly fatter capsule keeps the player from
    // visually clipping into geometry. Do not merge the two names: a local
    // `PLAYER_RADIUS` here silently shadows the import for the whole component.
    const PLAYER_COLLISION_RADIUS = 1.2;
    // How "up" a contact normal must be to count as standing on a surface
    // rather than sliding along a wall.
    const GROUND_NORMAL_THRESHOLD = 0.5;
    // Resolving one contact can push the player into another — with two
    // canopies close enough to overlap (common now that canopy height is
    // jittered per-tree but density/spacing is untouched), 2 passes wasn't
    // always enough to settle a 3+-way overlap, which read as getting stuck
    // between trees: pass N's push into contact A partially re-created
    // contact B, leaving a residual each round that never fully cleared.
    const COLLISION_PASSES = 5;
    // Trunks only rebound on a genuine head-on run into them. Grazing contact
    // slides instead, so brushing past a tree never takes control away.
    const TRUNK_REBOUND_MIN_SPEED = 4;

    const keysPressedRef = useRef<{ [key: string]: boolean }>({
        KeyW: false,
        KeyA: false,
        KeyS: false,
        KeyD: false,
    });

    useAudioListener(camera, listenerRef);

    useEffect(() => {
        if ((camera as PerspectiveCamera).fov) {
            baseFovRef.current = (camera as PerspectiveCamera).fov;
            currentFovRef.current = (camera as PerspectiveCamera).fov;
        }

        return () => {
            const perspectiveCamera = camera as PerspectiveCamera;
            if (perspectiveCamera.fov !== undefined) {
                perspectiveCamera.fov = baseFovRef.current;
                perspectiveCamera.updateProjectionMatrix();
            }
        };
    }, [camera]);

    const handlePositionAndCameraChange = React.useCallback((pos: Vector3, velocity: Vector3, cameraDirection: Vector3) => {
        socket.emit("updatePositionAndCamera", { position: pos, velocity, cameraDirection, roomId });
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
        onGrenade: () => {
            if (!grenadeCoolDownRef.current) {
                handleFireballShoot();
                grenadeCoolDownRef.current = true;
                setTimeout(() => (grenadeCoolDownRef.current = false), 5000);
                zoomIndexRef.current = 0;
            }
        },
        onRightMouseDown: () => {
            setIsFPS(true);
        },
        onRightMouseUp: () => {
            setIsFPS(false);
            zoomIndexRef.current = 0;
        },
        onLeftMouseDown() { },
        onLeftMouseUp() { },
        onScroll: (deltaY: number) => {
            if (!isFPS) return;
            const direction = deltaY > 0 ? -1 : 1;
            zoomIndexRef.current = Math.max(
                0,
                Math.min(ZOOM_LEVELS.length - 1, zoomIndexRef.current + direction)
            );
        },
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
            const sensitivity: number = 0.004 * sensitivityScaleRef.current;

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
        const walkSound = getLoopingSound('walk');
        return () => {
            walkSound.stop();
        };
    }, []);

    // Move player based on keyboard input and check collisions
    useFrame((_, delta) => {

        if (playerDeadRef.current) {
            // Force out of the scope on death so a respawn never inherits a
            // narrowed FOV or a stale "scoped" HUD state.
            if (zoomIndexRef.current !== 0) zoomIndexRef.current = 0;
            const scopedStore = useGameInfoStore.getState();
            if (scopedStore.isScoped) setScope(false, 1, 0);
            return;
        }

        const currentTime = performance.now() / 1000; // Convert to seconds

        // Get ground height for the player
        const groundY = getGroundHeight(playerPosition.current.x, playerPosition.current.z);

        // Standing on an obstacle (canopy, previously rocks) counts as
        // grounded too — otherwise a player on top of one is permanently
        // "airborne", so gravity keeps pulling them into it every frame and
        // jumping doesn't work. Set generically by the contact-resolution
        // pass below (any obstacle with an upward-facing normal), not by a
        // canopy-specific height scan — an earlier version of this computed
        // canopy surface height from a horizontal-only containment check with
        // no vertical bound, which would silently teleport a player walking
        // under a tree at ground level straight up to canopy height the
        // moment a canopy collider existed to trigger it.
        const onGround =
            playerPosition.current.y <= groundY + playerHeight + 1 ||
            groundedOnObstacleRef.current;

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

        // playerPosition.current is already eye-level (see the ground-snap
        // above: it's clamped to groundY + playerHeight), so the camera pivot
        // reads it directly instead of adding playerHeight a second time —
        // that used to plant the pivot a full body-height above the position
        // actually sent to the server, throwing off the boom camera's aim
        // (and therefore Gun.tsx's shot ray) by the same amount.
        const playerHeadPosition = playerPosition.current.clone();

        // Smooth the head position the camera reads, independent of the
        // exact (noisy) value used for movement/collision above.
        if (!smoothedHeadPosition.current) {
            smoothedHeadPosition.current = playerHeadPosition.clone();
        }
        const followSpeed = 10;
        const camT = 1 - Math.exp(-followSpeed * delta);
        smoothedHeadPosition.current.lerp(playerHeadPosition, camT);
        const smoothedHead = smoothedHeadPosition.current;

        // Scope zoom: narrow the FOV rather than dollying the camera forward.
        // Dollying broke down at high magnification (camera would clip through
        // walls/desync from the eye point the server validates hits against).
        // FOV only affects the projection, so the aim ray in Gun.tsx (which is
        // always the camera ray) is completely unaffected.
        const targetZoomIndex = isFPS ? zoomIndexRef.current : 0;
        const targetZoomLevel = ZOOM_LEVELS[targetZoomIndex];
        const targetFov = baseFovRef.current / targetZoomLevel;
        currentFovRef.current += (targetFov - currentFovRef.current) * Math.min(1, delta * 12);

        const perspectiveCamera = camera as PerspectiveCamera;
        if (perspectiveCamera.fov !== undefined && Math.abs(perspectiveCamera.fov - currentFovRef.current) > 0.01) {
            perspectiveCamera.fov = currentFovRef.current;
            perspectiveCamera.updateProjectionMatrix();
        }

        // Thin the fog while scoped in — a distant target shouldn't be
        // swallowed by the same haze that's tuned for hip-fire visibility.
        // Density is scaled by the same zoom ratio driving the FOV, so it
        // eases back in smoothly as the scope de-magnifies.
        const fog = scene.fog as FogExp2 | null;
        if (fog) {
            if (baseFogDensityRef.current === null) baseFogDensityRef.current = fog.density;
            const zoomRatio = baseFovRef.current / currentFovRef.current;
            fog.density = baseFogDensityRef.current / zoomRatio;
        }

        // Mouse sensitivity scales down with magnification (roughly 1/zoom,
        // slightly gentler than linear) so high zoom stays aimable instead of
        // sweeping the reticle across the screen on a small mouse move.
        sensitivityScaleRef.current = Math.pow(currentFovRef.current / baseFovRef.current, 0.85);

        const isScopedNow = isFPS;
        const scopedStore = useGameInfoStore.getState();
        if (scopedStore.isScoped !== isScopedNow || scopedStore.scopeLevel !== targetZoomLevel) {
            setScope(isScopedNow, targetZoomLevel, zoomPercent(targetZoomIndex));
        }

        if (isFPS) {
            const horizontalAngle = cameraAngles.current.horizontal;
            const verticalAngle = cameraAngles.current.vertical;

            // smoothedHead now reads playerPosition.current directly (true eye
            // level, no extra playerHeight added) — offset dropped from -2.5 to
            // +0.5 to keep the FPS eye at the same visual height as before this
            // pivot fix (was smoothedHead(eye+3) - 2.5 = eye+0.5).
            const eyeOffsetY = 0.5;
            const eye = smoothedHead.clone();
            eye.y += eyeOffsetY;

            // ADS: the gun sits offset from the player's body (see Gun.tsx's
            // group position), so a camera glued to the player's own eye line
            // looks past the gun rather than down its sight. Nudge the camera
            // toward the gun's mount so what's on screen actually lines up
            // with the sight the player is supposedly looking through.
            const right = new Vector3(-Math.cos(horizontalAngle), 0, Math.sin(horizontalAngle));
            eye.addScaledVector(right, 0.35);
            eye.y -= 0.15;

            camera.position.copy(eye);

            const forward = new Vector3(
                -Math.sin(horizontalAngle) * Math.cos(verticalAngle),
                -Math.sin(verticalAngle),
                -Math.cos(horizontalAngle) * Math.cos(verticalAngle)
            ).normalize();

            camera.lookAt(eye.clone().add(forward));

        } else {
            const cameraDistance = 6;
            const cameraHeight = 3;
            const smoothingFactor = 0.5;

            const horizontalAngle = cameraAngles.current.horizontal;
            const verticalAngle = cameraAngles.current.vertical;

            // The look direction, built from the mouse angles exactly as the
            // FPS branch does. This — not the boom geometry — is what the
            // camera's forward axis must end up being, because that axis is
            // simultaneously the crosshair and the shot ray Gun.tsx reads via
            // camera.getWorldDirection().
            //
            // The previous version derived forward from `lookAt(smoothedHead)`,
            // which aimed the camera at the player's own head. That made the
            // boom's +cameraHeight elevation reappear as downward pitch: with
            // verticalAngle at 0 the offset was (sin·6, 3, cos·6), so forward
            // came out 26.6 degrees below horizontal. Every "level" shot was
            // fired into the ground a few units ahead, and screen centre was
            // the player's own body rather than anything downrange.
            const forward = new Vector3(
                -Math.sin(horizontalAngle) * Math.cos(verticalAngle),
                -Math.sin(verticalAngle),
                -Math.cos(horizontalAngle) * Math.cos(verticalAngle)
            ).normalize();

            // Pivot the boom orbits: the head, raised. Elevation lives here,
            // in the camera's *position*, so it never leaks into the aim
            // direction the way it did before. No lateral offset — the boom
            // stays centred behind the player, so the crosshair sits on the
            // same vertical line as the body and there's no side parallax
            // between where you aim and where the ray actually goes.
            const pivot = smoothedHead.clone();
            pivot.y += cameraHeight;

            const idealCameraPosition = pivot.clone().addScaledVector(forward, -cameraDistance);

            camera.position.lerp(idealCameraPosition, smoothingFactor);

            // Pull in if the boom would put the camera inside geometry. Cast
            // from the pivot backwards along the boom, which is now just
            // -forward rather than a separate offset vector.
            const raycaster = new Raycaster();
            const boomDirection = forward.clone().negate();
            raycaster.set(pivot, boomDirection);

            const intersects = raycaster.intersectObjects(obstacles, true);
            if (intersects.length > 0 && intersects[0].distance < cameraDistance) {
                const safeDistance = Math.max(intersects[0].distance * 0.9, 0.5);
                camera.position.copy(pivot.clone().addScaledVector(boomDirection, safeDistance));
            }

            // Look *along* the aim direction, not at the player. Keeps the
            // camera's forward axis exactly equal to `forward`, so crosshair,
            // shot ray, and where the player thinks they're pointing all agree.
            camera.lookAt(camera.position.clone().addScaledVector(forward, 100));
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

        // Players always run; there is no sprint modifier to hold.
        const targetSpeed = SPRINT_SPEED;

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
            playerVelocity.current.y = groundedOnCanopyRef.current
                ? jumpStrength * CANOPY_JUMP_MULTIPLIER
                : jumpStrength;
            isJumpingRef.current = true;
            jumpRequested.current = false;
        }

        // Apply vertical movement
        playerPosition.current.y += playerVelocity.current.y * delta;

        // Terrain ground collision. Standing on an elevated obstacle (canopy)
        // is handled below by the generic contact resolution pass instead —
        // it positionally separates the player from the exact surface it's
        // touching, which is correct for a dome shape in a way a single scalar
        // "effective ground height" wasn't (see the onGround comment above).
        if (playerPosition.current.y < groundY + playerHeight) {
            isJumpingRef.current = false;
            playerPosition.current.y = groundY + playerHeight;
            playerVelocity.current.y = 0;
        }

        // ---- Obstacle collision: depth-based, multi-contact resolution ----
        // Each overlapping obstacle is separated from by its exact penetration
        // depth along the true surface normal. The old resolver had neither —
        // it restored the previous position or applied a fixed nudge, which
        // can't guarantee separation once the player is already inside a
        // volume, and it only ever handled one obstacle, so a player touching
        // both chunks of a rock was pushed out of one and into the other
        // forever.
        let supportedByObstacle = false;
        let trunkRebound: Vector3 | null = null;
        // Ellipsoid (canopy) obstacles the player is genuinely resting on
        // this frame, collected across every pass — used below to place the
        // player with an exact analytic surface height instead of leaving
        // them wherever the depth-based push landed, which is what made
        // canopy movement feel rough next to terrain's smooth analytic
        // height. See ellipsoidTopHeightAt's doc comment for why.
        const groundEllipsoids = new Set<Mesh>();

        for (let pass = 0; pass < COLLISION_PASSES; pass++) {
            const contacts = collectContacts(
                playerPosition.current,
                obstacles,
                PLAYER_COLLISION_RADIUS,
                playerHeight,
            );

            if (pass === 0) {
                collidingRef.current = contacts.length > 0;
                collisionNormalRef.current = contacts.length ? contacts[0].normal : null;
                collisionObjectRef.current = contacts.length ? contacts[0].object : null;
            }

            if (contacts.length === 0) break;

            for (const contact of contacts) {
                const { normal, depth, object } = contact;

                playerPosition.current.addScaledVector(normal, depth);

                if (normal.y > GROUND_NORMAL_THRESHOLD) {
                    // Resting on top of it. Separation above already placed the
                    // player on the surface, so all that's left is to stop the
                    // downward velocity and report grounded.
                    //
                    // Crucially, horizontal velocity is left completely alone
                    // here. A domed rock top has a normal that tilts downhill,
                    // so walking *up* the slope registers as moving "into" the
                    // surface — cancelling that (as the wall case below does)
                    // pinned the player in place on top of a rock, movable only
                    // by jumping clear of the contact. Walkable ground must
                    // never brake horizontal movement; the per-frame positional
                    // push-out is what keeps the player on the surface.
                    supportedByObstacle = true;
                    if (playerVelocity.current.y < 0) playerVelocity.current.y = 0;
                    if (object.geometry instanceof SphereGeometry) groundEllipsoids.add(object);
                } else {
                    if (normal.y < -GROUND_NORMAL_THRESHOLD) {
                        // Clipped the underside — stop rising.
                        if (playerVelocity.current.y > 0) playerVelocity.current.y = 0;
                    }

                    // Wall-like contact: cancel only the velocity going *into*
                    // the surface, leaving the tangential component intact, so
                    // the player slides along a rock face instead of being
                    // stopped dead or bounced off.
                    const horizontalNormal = new Vector3(normal.x, 0, normal.z);
                    if (horizontalNormal.lengthSq() > 1e-6) {
                        horizontalNormal.normalize();
                        const into = horizontalVelocity.current.dot(horizontalNormal);
                        if (into < 0) {
                            horizontalVelocity.current.addScaledVector(horizontalNormal, -into);

                            // Trunks keep their hard rebound, but only for a real
                            // head-on run into one — grazing contact now slides.
                            if (object.name === 'tree' && into < -TRUNK_REBOUND_MIN_SPEED) {
                                trunkRebound = horizontalNormal.clone();
                            }
                        }
                    }
                }
            }
        }

        // Smooth exact placement on whichever dome the player is resting on
        // (highest surface wins if two canopies overlap, so footing never
        // flickers between two different heights frame to frame). This is
        // the same kind of single analytic height lookup terrain uses, just
        // for a dome instead of noise — it's what actually removes the
        // roughness, the depth-based pushes above only guarantee no
        // interpenetration, not a smooth ride.
        let bestCanopySurfaceY: number | null = null;
        for (const ellipsoid of groundEllipsoids) {
            const surfaceY = ellipsoidTopHeightAt(playerPosition.current.x, playerPosition.current.z, ellipsoid);
            if (surfaceY !== null && (bestCanopySurfaceY === null || surfaceY > bestCanopySurfaceY)) {
                bestCanopySurfaceY = surfaceY;
            }
        }
        if (bestCanopySurfaceY !== null) {
            playerPosition.current.y = bestCanopySurfaceY + playerHeight;
            if (playerVelocity.current.y < 0) playerVelocity.current.y = 0;
        }

        groundedOnObstacleRef.current = supportedByObstacle;
        // bestCanopySurfaceY is non-null exactly when the player was placed on
        // a canopy dome this frame, which is the same "resting on a canopy"
        // condition the jump boost wants — reuse it rather than re-testing.
        groundedOnCanopyRef.current = bestCanopySurfaceY !== null;

        if (trunkRebound) {
            const timeSinceLastCollision = currentTime - lastCollisionTime.current;
            if (timeSinceLastCollision > COLLISION_COOLDOWN) {
                reboundVelocity.current.copy(trunkRebound).multiplyScalar(REBOUND_STRENGTH);
                horizontalVelocity.current.set(0, 0, 0);
                inputBlockedUntil.current = currentTime + INPUT_BLOCK_DURATION;
                lastCollisionTime.current = currentTime;
                playSound('hitWood', { volume: 1, rate: 0.5 });
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

        const walkSound = getLoopingSound('walk');

        if (isWalkingNow && !wasWalkingRef.current) {
            walkSound.volume(0.8);
            walkSound.rate(2);
            walkSound.play();
            socket.emit("playerWalking", { userId });
        } else if (!isWalkingNow && wasWalkingRef.current) {
            walkSound.stop();
            socket.emit("playerStopped", { userId });
        } else if (isWalkingNow && walkSound.playing()) {
            walkSound.volume(0.8);
            walkSound.rate(2);
        }

        wasWalkingRef.current = isWalkingNow;
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
                    playerDeadRef={playerDeadRef}
                />
            </group>
        </>
    );
};

export default Player;