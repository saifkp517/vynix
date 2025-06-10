import React, { RefObject, useEffect, useRef, useState } from 'react';
import { Opponent } from './Opponent';
import { useGroundHeight } from '../ground/Ground';
import socket from '@/lib/socket';
import * as THREE from 'three';

interface Props {
    hitPlayers: Record<string, boolean>;
    addObstacleRef: (ref: THREE.Mesh | null) => void;
    smoothnessRef: RefObject<number>;
    playerDataRef: RefObject<Record<string, PlayerData>>;
    showKillToast: (name: string) => void;
}

type PlayerData = {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
};

const RemoteOpponents: React.FC<Props> = ({ hitPlayers, addObstacleRef, smoothnessRef, playerDataRef, showKillToast }) => {
    const [playerIds, setPlayerIds] = useState<string[]>([]);
    const getGroundHeight = useGroundHeight();
    const deadPlayers = useRef<Set<string>>(new Set()); // Track dead players

    useEffect(() => {
        console.log('RemoteOpponents mounted, playerIds:', playerIds);

        const handlePlayerMoved = ({ id, position, velocity }: any) => {
            if (deadPlayers.current.has(id)) {
                console.log(`Ignoring playerMoved for dead player ${id}`);
                return;
            }

            playerDataRef.current[id] = {
                position: new THREE.Vector3(position.x, position.y, position.z),
                velocity: new THREE.Vector3(velocity.x, velocity.y, velocity.z),
            };
            setPlayerIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
        };

        const handlePlayerDisconnected = (id: string) => {
            console.log(`Player disconnected: ${id}`);
            delete playerDataRef.current[id];
            setPlayerIds((prev) => prev.filter((pid) => pid !== id));
            deadPlayers.current.delete(id); // Clean up
        };

        const handlePlayerDead = ({ userId, playerId }: any) => {
            console.log(`Player dead: ${playerId}, killed by ${userId}`);
            showKillToast(userId);
            deadPlayers.current.add(playerId); // Mark as dead
            delete playerDataRef.current[playerId]; // Remove data
            setPlayerIds((prev) => {
                const newIds = prev.filter(id => id !== playerId);
                console.log('After playerDead, playerIds:', newIds);
                return newIds;
            });

            // Optional: Respawn after 5 seconds
            setTimeout(() => {
                console.log(`Respawning player ${playerId}`);
                deadPlayers.current.delete(playerId); // Allow re-adding
                playerDataRef.current[playerId] = {
                    position: new THREE.Vector3(0, 0, 0),
                    velocity: new THREE.Vector3(0, 0, 0),
                };
                setPlayerIds((prev) => [...prev, playerId]);
            }, 5000);
        };

        const handlePlayerShotBulletAnimation = () => {
            
        }

        socket.on("playerMoved", handlePlayerMoved);
        socket.on("playerShot", handlePlayerShotBulletAnimation)
        socket.on("playerDisconnected", handlePlayerDisconnected);
        socket.on("playerDead", handlePlayerDead);

        return () => {
            console.log('RemoteOpponents unmounted, cleaning up socket listeners');
            socket.off("playerMoved", handlePlayerMoved);
            socket.off("playerDisconnected", handlePlayerDisconnected);
            socket.off("playerDead", handlePlayerDead);
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