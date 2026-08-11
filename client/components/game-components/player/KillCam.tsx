import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

interface KillCamProps {
    isPlayerDead: React.RefObject<boolean>;
    killerIdRef: React.RefObject<string | null>;
    playerDataRef: React.RefObject<{ [playerId: string]: { position: Vector3; velocity: Vector3; cameraDirection: Vector3 } }>;
    controlsRef: React.RefObject<any>;
}

const CHASE_DISTANCE = 6;
const CHASE_HEIGHT = 2.5;
const SMOOTHING = 0.15;

// While the local player is dead, takes over the main camera and follows
// whoever killed them, third-person, the same way RemoteOpponents renders
// every other player's model — so the respawn wait shows the kill instead
// of a blank loading screen. Player.tsx's own useFrame bails out entirely
// while dead (see playerDeadRef check there), so nothing else is driving
// the camera during this window.
const KillCam: React.FC<KillCamProps> = ({ isPlayerDead, killerIdRef, playerDataRef, controlsRef }) => {
    const { camera } = useThree();
    const hasSnapped = useRef(false);
    const wasDead = useRef(false);
    const hasWarned = useRef(false);

    useFrame(() => {
        if (!isPlayerDead.current) {
            if (wasDead.current && controlsRef.current) {
                // Player respawned — hand rotation control back to
                // PointerLockControls so it doesn't fight TPP's camera again.
                controlsRef.current.enabled = true;
            }
            wasDead.current = false;
            hasSnapped.current = false;
            hasWarned.current = false;
            return;
        }

        // PointerLockControls owns its own internal rotation state and
        // reapplies it to the camera on every raw 'mousemove' event,
        // regardless of what we set below — without disabling it here, any
        // mouse movement during the respawn wait yanks the camera away from
        // the killer mid-frame.
        if (controlsRef.current) controlsRef.current.enabled = false;
        wasDead.current = true;

        const killerId = killerIdRef.current;
        const killer = killerId ? playerDataRef.current[killerId] : undefined;

        // Killer disconnected/died themselves mid-killcam — hold the last
        // camera position rather than snapping anywhere. Logged so a report
        // of "camera doesn't move" is instantly diagnosable: either killerId
        // never arrived (server/event issue) or it arrived but has no entry
        // in playerDataRef (tracking issue) — this tells us which.
        if (!killer) {
            if (!hasWarned.current) {
                hasWarned.current = true;
                console.warn(
                    killerId
                        ? `[KillCam] killerId "${killerId}" has no playerDataRef entry — camera frozen`
                        : '[KillCam] isPlayerDead but killerIdRef is still null — camera frozen',
                );
            }
            return;
        }

        const forward = killer.cameraDirection.clone().normalize();
        const desiredPosition = killer.position
            .clone()
            .addScaledVector(forward, -CHASE_DISTANCE)
            .add(new Vector3(0, CHASE_HEIGHT, 0));

        if (!hasSnapped.current) {
            camera.position.copy(desiredPosition);
            hasSnapped.current = true;
        } else {
            camera.position.lerp(desiredPosition, SMOOTHING);
        }

        camera.lookAt(killer.position);
    });

    return null;
};

export default KillCam;
