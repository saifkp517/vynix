import React, { RefObject, useEffect, useRef, useState } from 'react';
import { Vector3, Mesh, PositionalAudio, AudioListener } from 'three';
import { EventEmitter } from 'events';

import { Opponent } from './Opponent';
import { useGroundHeight } from '../ground/Ground';
import { useWhyDidYouUpdate } from '@/lib/utils';

interface PlayerData {
    position: Vector3;
    velocity: Vector3;
    cameraDirection: Vector3;
}

interface Props {
    addObstacleRef: (ref: Mesh | null) => void;
    smoothnessRef: RefObject<number>;
    playerDataRef: RefObject<Record<string, PlayerData>>;
    showKillToast: (name: string) => void;
    listenerRef?: RefObject<AudioListener>;
    numBots?: number; // Optional prop to control number of bots
}

const BotOpponents: React.FC<Props> = ({
    addObstacleRef,
    smoothnessRef,
    playerDataRef,
    showKillToast,
    listenerRef,
    numBots = 3, // Default to 3 bots
}) => {

    const [botIds, setBotIds] = useState<string[]>([]);

    const getGroundHeight = useGroundHeight();
    const deadBots = useRef<Set<string>>(new Set()); // Track dead bots
    const shootEventEmitter = useRef(new EventEmitter()); // EventEmitter for botShot events
    const walkingAudioRefs = useRef<Record<string, PositionalAudio>>({});
    const shootingAudioRefs = useRef<Record<string, PositionalAudio>>({});


    // ===========================================
    // Bot Simulation Logic
    // ===========================================

    // Function to generate a random Vector3 within bounds (with optional y randomization)
    const randomVector = (min: number, max: number, randomizeY: boolean = true) => {
        return new Vector3(
            Math.random() * (max - min) + min,
            randomizeY ? Math.random() * (max - min) + min : 0,
            Math.random() * (max - min) + min
        );
    };

    // Simulate bot movement updates
    const updateBotMovement = (id: string) => {
        if (deadBots.current.has(id)) return;

        // Randomly adjust position, velocity, and camera direction
        const currentData = playerDataRef.current[id] || {
            position: new Vector3(0, 0, 0),
            velocity: new Vector3(0, 0, 0),
            cameraDirection: new Vector3(0, 0, -1),
        };

        const positionDelta = new Vector3(
            Math.random() * 2 - 1,  // Random x between -1 and 1
            0,                      // No change in y
            Math.random() * 2 - 1   // Random z between -1 and 1
        );

        const newPosition = currentData.position.clone().add(positionDelta);
        newPosition.y = getGroundHeight(newPosition.x, newPosition.z) + 2.5;  // Snap to ground

        const velocityDelta = randomVector(-5, 5, false); // Small random velocity change, no y
        const newVelocity = currentData.velocity.clone().add(velocityDelta).clampLength(0, 5); // Clamp speed

        const newCameraDirection = randomVector(-1, 1).normalize(); // Random look direction

        playerDataRef.current[id] = {
            position: newPosition,
            velocity: newVelocity,
            cameraDirection: newCameraDirection,
        };

        // Occasionally simulate shooting
        if (Math.random() < 0.1) { // 10% chance per update
            simulateBotShot(id);
        }

        // Simulate walking audio if moving
        if (newVelocity.length() > 0) {
            handleBotWalking({ userId: id });
        } else {
            handleBotStopped({ userId: id });
        }
    };

    // Simulate bot shot
    const simulateBotShot = (id: string) => {
        if (deadBots.current.has(id)) return;

        const data = playerDataRef.current[id];
        if (!data) return;

        const rayOrigin = data.position.clone();
        const rayDirection = data.cameraDirection.clone();

        shootEventEmitter.current.emit('playerShot', {
            id,
            rayOrigin,
            rayDirection,
        });
    };

    // Handle bot "death" (for simulation)
    const handleBotDead = (botId: string) => {
        showKillToast(`Bot ${botId}`); // Show toast with bot name
        deadBots.current.add(botId);
        delete playerDataRef.current[botId];

        setBotIds((prev) => prev.filter((id) => id !== botId));

        // Respawn logic after 5 seconds
        setTimeout(() => {
            deadBots.current.delete(botId);
            const respawnX = Math.random() * 20 - 10; // Random x between -10 and 10
            const respawnZ = Math.random() * 20 - 10; // Random z between -10 and 10
            const respawnY = getGroundHeight(respawnX, respawnZ); // Snap to ground
            playerDataRef.current[botId] = {
                position: new Vector3(respawnX, respawnY, respawnZ),
                velocity: new Vector3(0, 0, 0),
                cameraDirection: new Vector3(0, 0, -1),
            };
            setBotIds((prev) => [...prev, botId]);
        }, 5000);
    };

    const handleBotWalking = ({ userId }: { userId: string }) => {
        const audio = walkingAudioRefs.current[userId];
        if (audio && !audio.isPlaying) {
            audio.setDistanceModel('linear');
            audio.setRefDistance(5);
            audio.setMaxDistance(50);
            audio.setLoop(true);
            audio.setVolume(1);
            audio.play();
        }
    };

    const handleBotStopped = ({ userId }: { userId: string }) => {
        const audio = walkingAudioRefs.current[userId];
        if (audio && audio.isPlaying) {
            audio.stop();
        }
    };

    // =============================
    // Effect: Initialize Bots and Movement Simulation
    // =============================

    useEffect(() => {
        // Initialize bots
        const initialBotIds: string[] = [];
        for (let i = 1; i <= numBots; i++) {
            const botId = `bot${i}`;
            initialBotIds.push(botId);
            const initialX = Math.random() * 20 - 10; // Random x between -10 and 10
            const initialZ = Math.random() * 20 - 10; // Random z between -10 and 10
            const initialY = getGroundHeight(initialX, initialZ); // Snap to ground
            playerDataRef.current[botId] = {
                position: new Vector3(initialX, initialY, initialZ),
                velocity: new Vector3(0, 0, 0),
                cameraDirection: new Vector3(0, 0, -1),
            };
        }
        setBotIds(initialBotIds);

        // Set up interval for simulating movements
        const interval = setInterval(() => {
            initialBotIds.forEach((id) => {
                updateBotMovement(id);
            });
        }, 1000); // Update every second for simple random movements

        return () => {
            clearInterval(interval);
        };
    }, [numBots]);

    // =============================
    // Render
    // =============================

    return (
        <>
            {botIds.map((id) => {
                const data = playerDataRef.current[id];
                const isDead = deadBots.current.has(id);

                if (!data || isDead) return null;

                return (
                    <Opponent
                        key={id}
                        positionRef={() => playerDataRef.current[id]?.position || null}
                        velocityRef={() => playerDataRef.current[id]?.velocity || null}
                        cameraDirectionRef={() => playerDataRef.current[id]?.cameraDirection || null}
                        shootEvent={shootEventEmitter.current}
                        userId={id}
                        isRemote={true}
                        addObstacleRef={addObstacleRef}
                        getGroundHeight={getGroundHeight}
                        smoothnessRef={smoothnessRef}
                        listener={listenerRef?.current}
                        setAudioRef={(userId, audio) => {
                            walkingAudioRefs.current[userId] = audio;
                        }}
                    />
                );
            })}
        </>
    );
};

export default BotOpponents;
