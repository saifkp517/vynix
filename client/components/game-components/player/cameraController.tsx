/*
    camera controller should:
    - take player's head position
    - manages it's own mouse event listeners
    - handles camera positioning calculations
    - sends out camera direction as a socket event (mostly for radar ui)
    - takes obstacles as props for collision detection
*/

import React, { useRef, useEffect, useState } from "react"
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { usePlayerInput } from "@/hooks/usePlayerInput";


const CameraController: React.FC<any> = ({
    playerHeadPosition,
    obstacles
}) => {

    // ====================== Camera State Management ===========================


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

    // =================================== handle isFPS state ===========================
    const [isFPS, setIsFPS] = useState(false);

    usePlayerInput({
        onJump: () => { },
        onSprintStart: () => { },
        onSprintEnd: () => { },
        onGrenade: () => { },
        onRightMouseDown: () => {
            setIsFPS(true);
        },
        onRightMouseUp: () => {
            setIsFPS(false)
        },
        onLeftMouseDown() { },
        onLeftMouseUp() { },
        setMoveState() { },
    });

    // camera positioning logic

    const { camera } = useThree();

    useFrame((_, delta) => {
        if (isFPS) {


            const horizontalAngle = cameraAngles.current.horizontal;
            const verticalAngle = cameraAngles.current.vertical;

            // Position camera at the head (slightly offset optional to avoid clipping)
            const eyeOffsetY = -2.5; // tweak if needed (e.g., 0.1)
            const eye = playerHeadPosition.clone();
            eye.y += eyeOffsetY;

            camera.position.copy(eye);

            // Compute forward direction from angles
            const forward = new THREE.Vector3(
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

            const cameraOffset = new THREE.Vector3(
                Math.sin(horizontalAngle) * Math.cos(verticalAngle) * cameraDistance,
                Math.sin(verticalAngle) * cameraDistance + cameraHeight,
                Math.cos(horizontalAngle) * Math.cos(verticalAngle) * cameraDistance
            );

            const idealCameraPosition = playerHeadPosition.clone().add(cameraOffset);

            // Smooth camera movement
            camera.position.lerp(idealCameraPosition, smoothingFactor);

            // Handle camera collision (ray from head toward camera offset)
            const raycaster = new THREE.Raycaster();
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
    })

    return (
        <></>
    );
}


