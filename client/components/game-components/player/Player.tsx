// Player component
import React, { useRef, useState, useEffect, RefObject } from 'react';
import { PointerLockControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber'
import socket from '@/lib/socket';
import { Howl } from 'howler';
import Explosion from '../explosion/Explosion';
import Gun from './Gun';
import * as THREE from 'three';
import { EventEmitter } from 'events';



interface PlayerProps {
    obstacles: any;
    pingRef: RefObject<number>;
    grenadeCoolDownRef: RefObject<boolean>;
    getGroundHeight: (x: number, z: number) => number;
    ammoRef: RefObject<number>;
    otherPlayers: RefObject<{ [playerId: string]: { position: THREE.Vector3; velocity: THREE.Vector3 } }>;
    controlsRef: RefObject<any>;
    userId: string;
}

type FireballProps = {
    position: THREE.Vector3;
    getGroundHeight: (x: number, z: number) => number;
    direction: THREE.Vector3;
    speed?: number;
    obstacles?: THREE.Mesh[];
    onExplode: (position: THREE.Vector3) => void;
};

type GunProps = {
    camera: THREE.Camera
}





const Fireball: React.FC<FireballProps> = ({ position, getGroundHeight, direction, speed = 6, obstacles, onExplode }) => {
    const fireballRef = useRef<THREE.Mesh>(null);
    const startTime = useRef<number>(Date.now());

    const gravity = 9.8 / 4; // Gravity constant (adjust for desired arc height)



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

            const fireballBox = new THREE.Box3().setFromObject(fireballRef.current);
            const obstacleBox = new THREE.Box3().setFromObject(obstacle);


            const obstacleCenter = new THREE.Vector3();
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
    controlsRef,
    getGroundHeight,
    grenadeCoolDownRef,
    otherPlayers,
    ammoRef,
    pingRef,
    userId
}) => {

    const { camera } = useThree();
    const [colliding, setColliding] = useState(false);
    const [collisionNormal, setCollisionNormal] = useState<THREE.Vector3 | null>(null);
    const jumpRequested = useRef(false);
    const playerRef = useRef<THREE.Mesh>(null);
    const jumpDirection = useRef(new THREE.Vector3());
    const isJumpingRef = useRef(false);
    const [fireballs, setFireballs] = useState<{ id: number; position: THREE.Vector3; direction: THREE.Vector3 }[]>([]);
    const [collisionType, setCollisionType] = useState("");
    const [explosions, setExplosions] = useState<{ id: number; position: THREE.Vector3 }[]>([]);
    const lastUpdateTime = useRef(0);
    const explosionRadius = 15; // Explosion radius for damage calculation
    const [hitPlayers, setHitPlayers] = useState<{ [id: string]: boolean }>({});


    const raycaster = new THREE.Raycaster();
    const shootDirection = new THREE.Vector3();
    const recoilProgress = useRef(0);
    const isRecoiling = useRef(false);
    const gunRef = useRef<THREE.Group>(null as unknown as THREE.Group);

    const shootEvent = useRef(new EventEmitter());

    function handleShoot() {

        // Get direction camera is facing
        camera.getWorldDirection(shootDirection);

        const groundY = getGroundHeight(camera.position.x, camera.position.z);

        // Set ray origin and direction
        raycaster.set(camera.position, shootDirection);

        // Raycast against all mesh objects in the scene
        const intersects = raycaster.intersectObjects(obstacles, true); // true = recursive

        if (intersects.length > 0) {
            const firstHit = intersects[0];

            const hitX = firstHit.point.x;
            const hitZ = firstHit.point.z;
            const hitY = firstHit.point.y;

            const groundY = getGroundHeight(hitX, hitZ);

            const threshold = 0.1; // Tolerance for noise or minor overlap

            if (hitY <= groundY + threshold) {
                console.log("🚫 Shot blocked by terrain at", { x: hitX, y: groundY, z: hitZ });
            } else {
                const players = Object.values(otherPlayers.current);
                let hit = false;


                
                players.forEach((player) => {
                    const playerPosition = player.position.clone();
                    // Assume player is a sphere with radius 1 (adjust as needed)
                    const playerRadius = 1;
                    // Ray-sphere intersection
                    const originToCenter = playerPosition.clone().sub(camera.position);
                    const tca = originToCenter.dot(shootDirection);
                    if (tca < 0) return; // Player is behind shooter
                    const d2 = originToCenter.lengthSq() - tca * tca;
                    if (d2 > playerRadius * playerRadius) return; // Missed
                    // Hit!
                    if (!hit) {
                        hit = true;
                        console.log("hit!");
                        const shootObject = {
                            rayOrigin: camera.position,
                            rayDirection: shootDirection,
                            timestamp: Date.now(),
                            ping: pingRef.current
                        };
                        socket.emit("shoot", { userId, shootObject });
                    }
                });



                // Apply logic to the object (damage, highlight, etc.)
            }
        } else {
            console.log("missed");
        }

    }

    const checkCollisions = (playerPosition: THREE.Vector3) => {

        // Create player hitbox - keeping box for player
        const playerBox = new THREE.Box3().setFromCenterAndSize(
            playerPosition,
            new THREE.Vector3(1, 2, 1) // Player size
        );

        // Player sphere representation (for sphere-to-sphere collision)
        const playerSphere = new THREE.Sphere(
            playerPosition.clone(),
            1 // Player radius (adjust based on your player size)
        );

        // Get player center for calculations
        const playerCenter = new THREE.Vector3();
        playerBox.getCenter(playerCenter);

        // Check collision with each obstacle
        let isColliding = false;
        for (const obstacle of obstacles) {
            if (!obstacle) continue;

            // Determine if obstacle is spherical by checking its geometry
            const isObstacleSphere = obstacle.geometry instanceof THREE.SphereGeometry;
            const isObstacleCylinder = obstacle.geometry instanceof THREE.CylinderGeometry;

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
                    const collisionNormal = new THREE.Vector3()
                        .subVectors(playerCenter, obstaclePosition)
                        .normalize();

                    setCollisionNormal(collisionNormal);
                    isColliding = true;
                    break;
                }
            } else if (isObstacleCylinder) {
                // Handle cylinder collision with any orientation
                const obstaclePosition = new THREE.Vector3();
                obstacle.getWorldPosition(obstaclePosition);

                const obstacleScale = new THREE.Vector3();
                obstacle.getWorldScale(obstacleScale);

                // Get cylinder properties
                const radiusTop = obstacle.geometry.parameters.radiusTop;
                const radiusBottom = obstacle.geometry.parameters.radiusBottom || radiusTop;


                const radius = Math.max(radiusTop, radiusBottom) * Math.max(obstacleScale.x, obstacleScale.z);
                const height = obstacle.geometry.parameters.height * obstacleScale.y;

                // Get cylinder's axis vector (assuming Y is the height axis in cylinder geometry)
                // We need to extract the Y axis of the cylinder from its world matrix
                const cylinderMatrix = obstacle.matrixWorld.clone();
                const cylinderUpVector = new THREE.Vector3(0, 1, 0).applyMatrix4(
                    new THREE.Matrix4().extractRotation(cylinderMatrix)
                ).normalize();

                // Get cylinder endpoints
                const cylinderCenter = obstaclePosition.clone();
                const cylinderEnd1 = cylinderCenter.clone().addScaledVector(cylinderUpVector, height / 2);
                const cylinderEnd2 = cylinderCenter.clone().addScaledVector(cylinderUpVector, -height / 2);

                // Project player center onto cylinder axis
                const toPlayer = new THREE.Vector3().subVectors(playerCenter, cylinderEnd1);
                const axisLine = new THREE.Vector3().subVectors(cylinderEnd2, cylinderEnd1);
                const axisLength = axisLine.length();
                const axisNormalized = axisLine.clone().normalize();

                // Projection calculation
                const projectionLength = toPlayer.dot(axisNormalized);
                const projectionPoint = new THREE.Vector3().copy(cylinderEnd1).addScaledVector(axisNormalized, projectionLength);

                // Check if projection is within cylinder length
                const withinCylinderLength = projectionLength >= 0 && projectionLength <= axisLength;

                // Distance from player to nearest point on cylinder axis
                let distanceToAxis;
                let collisionNormal;
                let collisionPoint;

                if (withinCylinderLength) {
                    // Player is alongside the cylinder body
                    // Get distance from player to axis
                    distanceToAxis = new THREE.Vector3().subVectors(playerCenter, projectionPoint).length();

                    if (distanceToAxis < radius + playerSphere.radius) {
                        // Collision with cylinder side
                        collisionNormal = new THREE.Vector3().subVectors(playerCenter, projectionPoint).normalize();
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
                    const distanceToEnd = new THREE.Vector3().subVectors(playerCenter, endPoint).length();

                    if (distanceToEnd < radius + playerSphere.radius) {
                        // End cap collision
                        collisionNormal = new THREE.Vector3().subVectors(playerCenter, endPoint).normalize();
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
                const obstacleBox = new THREE.Box3().setFromObject(obstacle);

                if (playerBox.intersectsBox(obstacleBox)) {
                    setCollisionType("box")
                    let collisionNormal = new THREE.Vector3(0, 0, 0);

                    let obstacleCenter = new THREE.Vector3();
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
    };


    const handlePositionChange = React.useCallback((pos: THREE.Vector3, velocity: THREE.Vector3) => {
        socket.emit("updatePosition", pos, velocity);
    }, []);



    const handleFireballShoot = () => {
        if (!playerRef.current) return;

        const startPosition = playerRef.current.position.clone();

        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        const newFireball = {
            id: Date.now(),
            position: startPosition, // Player's position
            direction: cameraDirection, // Forward direction
        };
        setFireballs((prev) => [...prev, newFireball]);

    };

    const getDistance = (pos1: THREE.Vector3, pos2: number[]) => {
        return Math.sqrt(
            Math.pow(pos2[0] - pos1.x, 2) +
            Math.pow(pos2[1] - pos1.y, 2) +
            Math.pow(pos2[2] - pos1.z, 2)
        );
    };

    const handleExplosion = (position: THREE.Vector3) => {

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

    const gravity = -9.8 * 4;
    const jumpStrength = 15;

    const playerSpeed = useRef(10);
    const playerHeight = 3;
    

    const velocity = useRef<THREE.Vector3>(new THREE.Vector3());
    const direction = useRef<THREE.Vector3>(new THREE.Vector3());
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
                shootingInterval = setInterval(() => {
                    handleShoot();
                }, 200); // Adjust shooting interval as needed
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


    // Move player based on keyboard input and check collisions
    useFrame((_, delta) => {
        if (!controlsRef?.current?.isLocked) return;


        let isGrounded = false;

        //get parent terrain ground height
        const groundY = getGroundHeight(camera.position.x, camera.position.z);
        let onGround = camera.position.y <= groundY + playerHeight;

        if (playerRef.current) {
            playerRef.current.position.copy(camera.position);
        }

        checkCollisions(playerRef.current?.position || new THREE.Vector3(0, 0, 0));

        // Calculate movement direction based on camera orientation
        direction.current.z = Number(moveState.forward) - Number(moveState.backward);
        direction.current.x = Number(moveState.right) - Number(moveState.left);
        direction.current.normalize();

        // Apply movement in the camera direction
        const frontVector = new THREE.Vector3(0, 0, Number(moveState.forward) - Number(moveState.backward));
        const sideVector = new THREE.Vector3(Number(moveState.left) - Number(moveState.right), 0, 0);
        const horizontalMove = frontVector.add(sideVector).normalize().multiplyScalar(playerSpeed.current * delta);

        // Combine and normalize movement vector
        const moveVector = new THREE.Vector3(
            horizontalMove.x,
            velocity.current.y * delta, // Vertical movement from gravity
            horizontalMove.z
        );

        // Get camera direction (excluding y-axis)
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0;
        cameraDirection.normalize();


        // Calculate movement in camera space
        const moveQuat = new THREE.Quaternion();
        moveQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), cameraDirection);
        moveVector.applyQuaternion(moveQuat);

        const playerPosition = camera.position.clone();

        velocity.current.set(moveVector.x / delta, velocity.current.y, moveVector.z / delta);


        // Step 2: Apply movement
        camera.position.add(moveVector);

        //handle jump

        if (jumpRequested.current && onGround) {
            jumpDirection.current.copy(cameraDirection);

            velocity.current.y = jumpStrength;
            isJumpingRef.current = true;
            jumpRequested.current = false;
        }

        //work later
        // if (isJumpingRef.current && moveState.forward == false) {
        //     camera.position.addScaledVector(jumpDirection.current, playerSpeed.current / 2 * delta);
        // }

        // Apply gravity

        if (!isGrounded) {
            velocity.current.y += gravity * delta;
        }
        camera.position.y += velocity.current.y * delta;



        if (camera.position.y < groundY + playerHeight - 0.5) {
            isJumpingRef.current = false;
            camera.position.y = groundY + playerHeight - 0.5;
            velocity.current.y = 0;
        }



        //collision detection handling
        if (colliding) {
            isJumpingRef.current = false;
            const normal = collisionNormal!.clone().normalize();

            // Restore previous position
            camera.position.copy(playerPosition);

            // Check if the player is on top of something
            const isOnTop = normal.y > 0.7;

            // console.log(collisionType)
            if (collisionType === "sphere") {
                // Spherical collision handling
                if (isOnTop) {
                    // Standing on top of sphere
                    isGrounded = true;

                    // Apply horizontal movement
                    const cameraDirection = new THREE.Vector3();
                    camera.getWorldDirection(cameraDirection);
                    cameraDirection.y = 0;
                    cameraDirection.normalize();

                    if (jumpRequested.current) {
                        cameraDirection.normalize().multiplyScalar(playerSpeed.current);

                        velocity.current.y = jumpStrength;
                        isJumpingRef.current = true;
                        jumpRequested.current = false;
                    }


                    const moveQuat = new THREE.Quaternion();
                    moveQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), cameraDirection);

                    const horizontalMoveWorld = horizontalMove.clone().applyQuaternion(moveQuat);
                    camera.position.x += horizontalMoveWorld.x;
                    camera.position.z += horizontalMoveWorld.z;

                    //jump from top
                    const topHeight = camera.position.y;
                    const nextY = camera.position.y + velocity.current.y * delta;

                    if (nextY >= topHeight) {
                        camera.position.y = nextY;
                    } else {
                        camera.position.y = topHeight;
                        velocity.current.y = 0;
                        isJumpingRef.current = false;
                    }
                } else {
                    // Side collision with sphere
                    const movingAwayFromCollision = moveVector.dot(normal) > 0;

                    if (movingAwayFromCollision) {
                        camera.position.add(moveVector);
                    } else {
                        // Project the movement onto the tangent plane of the sphere
                        const slideVector = moveVector.clone().projectOnPlane(normal);
                        const pushDistance = 0.001;

                        camera.position.addScaledVector(normal, pushDistance);
                        camera.position.add(slideVector);

                        // Adjust vertical velocity based on where on the sphere we hit
                        if (normal.y < 0) {
                            // Hitting ceiling-like part of sphere
                            velocity.current.y = Math.min(velocity.current.y, 0);
                        } else if (Math.abs(normal.y) < 0.3) {
                            // Side collision with sphere
                            if (velocity.current.y > 0) {
                                velocity.current.y *= 0.8;
                            }
                        }
                    }
                }
            } else if (collisionType === "cylinder-side") {
                // Cylinder side collision
                const movingAwayFromCollision = moveVector.dot(normal) > 0;

                if (movingAwayFromCollision) {
                    camera.position.add(moveVector);
                } else {
                    // Project movement onto the tangent plane of the cylinder side
                    const slideVector = moveVector.clone().projectOnPlane(normal);

                    // Add a small push away from the surface to prevent sticking
                    const pushDistance = 0.001;
                    camera.position.addScaledVector(normal, pushDistance);
                    camera.position.add(slideVector);
                }
            } else if (collisionType === "cylinder-top" || collisionType === "cylinder-bottom") {
                // Cap collision - depends on orientation 
                const movingAwayFromCollision = moveVector.dot(normal) > 0;

                if (movingAwayFromCollision) {
                    camera.position.add(moveVector);
                } else {
                    // Treat cap like a flat surface
                    const slideVector = moveVector.clone().projectOnPlane(normal);

                    // Check if this is a top cap that can be stood on
                    // We only want the player to stand on relatively flat surfaces
                    const upDot = normal.dot(new THREE.Vector3(0, 1, 0));
                    if (Math.abs(upDot) > 0.7) { // Cap is mostly horizontal
                        isGrounded = upDot > 0; // Only if normal points up

                        if (isGrounded && jumpRequested.current) {
                            velocity.current.y = jumpStrength;
                            isJumpingRef.current = true;
                            jumpRequested.current = false;
                        }
                    }

                    // Add a small push away from the surface
                    const pushDistance = 0.001;
                    camera.position.addScaledVector(normal, pushDistance);
                    camera.position.add(slideVector);
                }
            } else {
                // Box collision (original code)
                if (isOnTop) {

                    isGrounded = true;
                    onGround = true;

                    const cameraDirection = new THREE.Vector3();
                    camera.getWorldDirection(cameraDirection);
                    cameraDirection.y = 0;
                    cameraDirection.normalize();

                    if (jumpRequested.current) {
                        cameraDirection.normalize().multiplyScalar(playerSpeed.current);

                        velocity.current.y = jumpStrength;
                        isJumpingRef.current = true;
                        jumpRequested.current = false;
                    }



                    const moveQuat = new THREE.Quaternion();
                    moveQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), cameraDirection);

                    const horizontalMoveWorld = horizontalMove.clone().applyQuaternion(moveQuat);
                    camera.position.x += horizontalMoveWorld.x;
                    camera.position.z += horizontalMoveWorld.z;

                    //jump from top
                    const topHeight = camera.position.y;
                    const nextY = camera.position.y + velocity.current.y * delta;

                    if (nextY >= topHeight) {
                        camera.position.y = nextY;
                    } else {
                        camera.position.y = topHeight;
                        velocity.current.y = 0;
                        isJumpingRef.current = false;
                    }
                } else {
                    const movingAwayFromWall = moveVector.dot(normal) > 0;

                    if (movingAwayFromWall) {
                        camera.position.add(moveVector);
                    } else {
                        const slideVector = moveVector.clone().projectOnPlane(normal);
                        const pushDistance = 0.001;

                        camera.position.addScaledVector(normal, pushDistance);
                        camera.position.add(slideVector);
                    }
                }
            }
        }



        //sync player rotation with camera
        if (playerRef.current) {
            playerRef.current.position.copy(camera.position);
            // Sync rotation — full 3D (quaternion handles X, Y, Z correctly)
            playerRef.current.quaternion.copy(camera.quaternion);
        }


        playerPosition.copy(camera.position);
        playerPosition.y -= playerHeight - 1.5;


        const currentTime = performance.now();

        // Only emit the position change every 100ms

        if (currentTime - lastUpdateTime.current >= 100) {
            handlePositionChange(playerPosition.clone(), velocity.current.clone());
            lastUpdateTime.current = currentTime;
        }

        checkCollisions(playerPosition);


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
            <group ref={playerRef} position={camera.position}>
                {/* Collision box */}
                <mesh visible={false} position={[0, -1, 0]}>
                    <boxGeometry args={[1, 2, 1]} />
                </mesh>

                {/* Visible player mesh */}
                <mesh position={[0, -1, 0]}>
                    {/* <capsuleGeometry args={[0.5, 1, 8, 16]} /> */}
                    <meshStandardMaterial color="skyblue" />
                </mesh>

                {/* Gun (attached to player's right hand) */}
                <Gun
                    gunRef={gunRef}
                    camera={camera}
                    ammoRef={ammoRef}
                    shootEvent={shootEvent.current}
                    pingRef={pingRef}
                    userId={userId}
                    otherPlayers={otherPlayers}
                />
            </group>
        </>
    );
};

export default Player;