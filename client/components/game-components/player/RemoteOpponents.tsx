import React, { RefObject, useEffect, useRef, useState } from 'react';
import { useWhyDidYouUpdate } from '@/lib/utils';
import { Opponent } from './Opponent';
import { useGroundHeight } from '../ground/Ground';
import socket from '@/lib/socket';
import { Vector3, Mesh } from 'three';
import { EventEmitter } from 'events';

interface Props {
    hitPlayers: Record<string, boolean>;
    addObstacleRef: (ref: Mesh | null) => void;
    smoothnessRef: RefObject<number>;
    playerDataRef: RefObject<Record<string, PlayerData>>;
    showKillToast: (name: string) => void;
}

type PlayerData = {
    position: Vector3;
    velocity: Vector3;
    cameraDirection: Vector3;
};

const RemoteOpponents: React.FC<Props> = ({ hitPlayers, addObstacleRef, smoothnessRef, playerDataRef, showKillToast }) => {
    const [playerIds, setPlayerIds] = useState<string[]>([]);
    const getGroundHeight = useGroundHeight();
    const deadPlayers = useRef<Set<string>>(new Set()); // Track dead players
    const shootEventEmitter = useRef(new EventEmitter()); // EventEmitter for playerShot events



    useWhyDidYouUpdate("remoteOpponents", {
        playerIds
    });

    useEffect(() => {
        console.log('RemoteOpponents mounted, playerIds:', playerIds);

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
            console.log(`Player disconnected: ${id}`);
            delete playerDataRef.current[id];
            setPlayerIds((prev) => prev.filter((pid) => pid !== id));
            deadPlayers.current.delete(id); // Clean up
        };

        const handlePlayerDead = ({ userId, playerId }: { userId: string; playerId: string }) => {
            console.log(`Player dead: ${playerId}, killed by ${userId}`);
            showKillToast(userId);
            deadPlayers.current.add(playerId); // Mark as dead
            delete playerDataRef.current[playerId]; // Remove data
            setPlayerIds((prev) => {
                const newIds = prev.filter(id => id !== playerId);
                console.log('After playerDead, playerIds:', newIds);
                return newIds;
            });

            // Respawn after 6 seconds
            setTimeout(() => {
                console.log(`Respawning player ${playerId}`);
                deadPlayers.current.delete(playerId); // Allow re-adding
                playerDataRef.current[playerId] = {
                    position: new Vector3(0, 0, 0),
                    velocity: new Vector3(0, 0, 0),
                    cameraDirection: new Vector3(0, 0, -1), // Default direction
                };
                setPlayerIds((prev) => [...prev, playerId]);
            }, 6000);
        };

        const handleShoot = ({ id, rayOrigin, rayDirection }: { id: string; rayOrigin: Vector3; rayDirection: Vector3 }) => {
            if (deadPlayers.current.has(id)) {
                console.log(`Ignoring playerShot for dead player ${id}`);
                return;
            }
            console.log(`Player shot: ${id}, rayOrigin:`, rayOrigin, 'rayDirection:', rayDirection);
            shootEventEmitter.current.emit('playerShot', {
                id,
                rayOrigin: new Vector3(rayOrigin.x, rayOrigin.y, rayOrigin.z),
                rayDirection: new Vector3(rayDirection.x, rayDirection.y, rayDirection.z),
            });
        };

        socket.on('playerMoved', handlePlayerMoved);
        socket.on('playerDisconnected', handlePlayerDisconnected);
        socket.on('playerDead', handlePlayerDead);
        socket.on('playerShot', handleShoot);

        return () => {
            console.log('RemoteOpponents unmounted, cleaning up socket listeners');
            socket.off('playerMoved', handlePlayerMoved);
            socket.off('playerDisconnected', handlePlayerDisconnected);
            socket.off('playerDead', handlePlayerDead);
            socket.off('playerShot', handleShoot);
        };
    }, [playerDataRef, showKillToast]);

    return (
        <>
            {playerIds.map((id) => {
                const data = playerDataRef.current[id];
                if (!data || deadPlayers.current.has(id)) {
                    console.log(`Skipping render for ${id}, data:`, data, 'isDead:', deadPlayers.current.has(id));
                    return null;
                }

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
                    />
                );
            })}
        </>
    );
};

export default RemoteOpponents;