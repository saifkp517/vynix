import React, { RefObject, useEffect, useRef, useState } from 'react';
import { Vector3, Mesh, PositionalAudio, AudioListener } from 'three';
import { EventEmitter } from 'events';


import { Opponent } from './Opponent';
import { useGroundHeight } from '../ground/Ground';
import socket from '@/lib/socket';
import { useWhyDidYouUpdate } from '@/lib/utils';

interface PlayerData {
    position: Vector3;
    velocity: Vector3;
    cameraDirection: Vector3;
}


interface Props {
    hitPlayers: Record<string, boolean>;
    addObstacleRef: (ref: Mesh | null) => void;
    smoothnessRef: RefObject<number>;
    playerDataRef: RefObject<Record<string, PlayerData>>;
    showKillToast: (name: string) => void;
    listenerRef?: RefObject<AudioListener>;
}


const RemoteOpponents: React.FC<Props> = ({
    hitPlayers,
    addObstacleRef,
    smoothnessRef,
    playerDataRef,
    showKillToast,
    listenerRef
}) => {

    const [playerIds, setPlayerIds] = useState<string[]>([]);


    const getGroundHeight = useGroundHeight();
    const deadPlayers = useRef<Set<string>>(new Set()); // Track dead players
    const shootEventEmitter = useRef(new EventEmitter()); // EventEmitter for playerShot events
    const walkingAudioRefs = useRef<Record<string, PositionalAudio>>({});
    const shootingAudioRefs = useRef<Record<string, PositionalAudio>>({});



    // ===========================================
    // Socket Event Handlers
    // ===========================================

    const handlePlayerMoved = ({
        id,
        position,
        velocity,
        cameraDirection,
    }: {
        id: string;
        position: Vector3;
        velocity: Vector3;
        cameraDirection: Vector3;
    }) => {
        if (deadPlayers.current.has(id)) {
            console.log(`Ignoring playerMoved for dead player ${id}`);
            return;
        }

        playerDataRef.current[id] = {
            position: new Vector3(position.x, position.y, position.z),
            velocity: new Vector3(velocity.x, velocity.y, velocity.z),
            cameraDirection: new Vector3(cameraDirection.x, cameraDirection.y, cameraDirection.z),
        };
        setPlayerIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    };


    const handlePlayerDisconnected = (id: string) => {
        delete playerDataRef.current[id];
        deadPlayers.current.delete(id);
        setPlayerIds((prev) => prev.filter((pid) => pid !== id));
    };


    const handlePlayerDead = ({ userId, playerId }: { userId: string; playerId: string }) => {
        showKillToast(userId);
        deadPlayers.current.add(playerId);
        delete playerDataRef.current[playerId];

        setPlayerIds((prev) => prev.filter((id) => id !== playerId));

        // Respawn logic
        setTimeout(() => {
            deadPlayers.current.delete(playerId);
            playerDataRef.current[playerId] = {
                position: new Vector3(0, 0, 0),
                velocity: new Vector3(0, 0, 0),
                cameraDirection: new Vector3(0, 0, -1),
            };
            setPlayerIds((prev) => [...prev, playerId]);
        }, 5000);
    };


    const handlePlayerShot = ({
        id,
        rayOrigin,
        rayDirection,
    }: {
        id: string;
        rayOrigin: Vector3;
        rayDirection: Vector3;
    }) => {
        if (deadPlayers.current.has(id)) return;

        shootEventEmitter.current.emit('playerShot', {
            id,
            rayOrigin: new Vector3(rayOrigin.x, rayOrigin.y, rayOrigin.z),
            rayDirection: new Vector3(rayDirection.x, rayDirection.y, rayDirection.z),
        });
    };


    const handlePlayerWalking = ({ userId }: { userId: string }) => {
        const audio = walkingAudioRefs.current[userId];
        if (audio && !audio.isPlaying) {
            audio.setDistanceModel('linear') //allows full cut off of volume
            audio.setRefDistance(5);
            audio.setMaxDistance(25)
            
            audio.setLoop(true);
            audio.setVolume(1);
            audio.play();
        }
    };


    const handlePlayerStopped = ({ userId }: { userId: string }) => {
        const audio = walkingAudioRefs.current[userId];
        if (audio && audio.isPlaying) {
            audio.stop();
        }
    };

    // =============================
    // Effect: Attach Socket Events
    // =============================

    useEffect(() => {
        socket.on('playerMoved', handlePlayerMoved);
        socket.on('disconnect', handlePlayerDisconnected);
        socket.on('playerDead', handlePlayerDead);
        socket.on('playerShot', handlePlayerShot);
        socket.on('playerWalking', handlePlayerWalking);
        socket.on('playerStopped', handlePlayerStopped);

        return () => {
            socket.off('playerMoved', handlePlayerMoved);
            socket.off('disconnect', handlePlayerDisconnected);
            socket.off('playerDead', handlePlayerDead);
            socket.off('playerShot', handlePlayerShot);
            socket.off('playerWalking', handlePlayerWalking);
            socket.off('playerStopped', handlePlayerStopped);
        };
    }, [playerDataRef]);

    // =============================
    // Render
    // =============================

    return (
        <>
            {playerIds.map((id) => {
                const data = playerDataRef.current[id];
                const isDead = deadPlayers.current.has(id);

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
                        isHit={!!hitPlayers[id]}
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

    return (
        <>
            {playerIds.map((id) => {
                const data = playerDataRef.current[id];
                if (!data || deadPlayers.current.has(id)) {
                    console.log(`Skipping render for ${id}, data:`, data, 'isDead:', deadPlayers.current.has(id));
                    return null;
                }


            })}
        </>
    );
};

export default RemoteOpponents;