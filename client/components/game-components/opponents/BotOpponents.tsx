import React, { RefObject, useEffect, useRef, useState } from 'react';
import { Vector3, Mesh, AudioListener } from 'three';
import { EventEmitter } from 'events';

import BotOpponent from './BotOpponent';
import { useGroundHeight } from '../ground/Ground';

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
    numBots?: number;
}

const BotOpponents: React.FC<Props> = ({
    addObstacleRef,
    smoothnessRef,
    playerDataRef,
    showKillToast,
    listenerRef,
    numBots = 3,
}) => {
    const [botIds, setBotIds] = useState<string[]>([]);
    const getGroundHeight = useGroundHeight();
    const deadBots = useRef<Set<string>>(new Set());
    const shootEventEmitter = useRef(new EventEmitter());

    // Initialize bots with different spawn positions
    useEffect(() => {
        const initialBotIds: string[] = [];
        for (let i = 1; i <= numBots; i++) {
            const botId = `bot${i}`;
            initialBotIds.push(botId);
            
            // Give each bot a random spawn position
            const spawnPosition = getRandomSpawnPosition();
            playerDataRef.current[botId] = {
                position: spawnPosition,
                velocity: new Vector3(0, 0, 0),
                cameraDirection: new Vector3(0, 0, -1),
            };
        }
        setBotIds(initialBotIds);

        return () => {
            // Cleanup: remove bot data when component unmounts
            initialBotIds.forEach(id => {
                delete playerDataRef.current[id];
            });
        };
    }, [numBots]);

    const getRandomSpawnPosition = () => {
        const x = Math.random() * 40 - 20; // Random x between -20 and 20
        const z = Math.random() * 40 - 20; // Random z between -20 and 20
        const y = getGroundHeight(x, z) + 2.5;
        return new Vector3(x, y, z);
    };

    const handleBotDeath = (botId: string) => {
        showKillToast(`Bot ${botId}`);
        deadBots.current.add(botId);
        delete playerDataRef.current[botId];
        setBotIds(prev => prev.filter(id => id !== botId));

        // Respawn after delay
        setTimeout(() => {
            if (deadBots.current.has(botId)) {
                deadBots.current.delete(botId);
                const respawnPosition = getRandomSpawnPosition();
                playerDataRef.current[botId] = {
                    position: respawnPosition,
                    velocity: new Vector3(0, 0, 0),
                    cameraDirection: new Vector3(0, 0, -1),
                };
                setBotIds(prev => [...prev, botId]);
            }
        }, 5000);
    };

    return (
        <>
            {botIds.map((id) => {
                const data = playerDataRef.current[id];
                const isDead = deadBots.current.has(id);

                if (!data || isDead) return null;

                return (
                    <BotOpponent
                        key={id}
                        botId={id}
                        playerDataRef={playerDataRef}
                        shootEvent={shootEventEmitter.current}
                        addObstacleRef={addObstacleRef}
                        getGroundHeight={getGroundHeight}
                        smoothnessRef={smoothnessRef}
                        listener={listenerRef?.current}
                        onDeath={() => handleBotDeath(id)}
                    />
                );
            })}
        </>
    );
};

export default BotOpponents;
