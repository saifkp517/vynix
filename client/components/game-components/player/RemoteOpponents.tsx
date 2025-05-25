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

    useEffect(() => {
        const handlePlayerMoved = ({ id, position, velocity }: any) => {
            playerDataRef.current[id] = {
                position: new THREE.Vector3(position.x, position.y, position.z),
                velocity: new THREE.Vector3(velocity.x, velocity.y, velocity.z),
            };
            setPlayerIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
        };

        const handlePlayerDisconnected = (id: string) => {
            delete playerDataRef.current[id];
            setPlayerIds((prev) => prev.filter((pid) => pid !== id));
        };

        const handlePlayerDead = ({ userId, playerId }: any) => {
            showKillToast(userId);
            console.log(`${playerId} was killed by ${userId}`);
            delete playerDataRef.current[playerId];
            setPlayerIds((prev) => prev.filter(id => id !== playerId));

            // Optional: Respawn after 3 seconds
            setTimeout(() => {
            }, 5000);

            // playerDataRef.current[playerId] = {
            //     position: new THREE.Vector3(0, 0, 0),
            //     velocity: new THREE.Vector3(0, 0, 0),
            // };
            // setPlayerIds((prev) => [...prev, playerId]);
        };

        socket.on("playerMoved", handlePlayerMoved);
        socket.on("playerDisconnected", handlePlayerDisconnected);
        socket.on("playerDead", handlePlayerDead);

        return () => {
            socket.off("playerMoved", handlePlayerMoved);
            socket.off("playerDisconnected", handlePlayerDisconnected);
            socket.off("playerDead", handlePlayerDead);
        };
    }, []);


    return (
        <>
            {playerIds.map((id) => {
                const data = playerDataRef.current[id];
                if (!data) return null;

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
