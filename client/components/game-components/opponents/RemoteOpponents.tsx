import React, { RefObject, useEffect, useRef, useState } from 'react';
import { Vector3, Mesh, PositionalAudio, AudioListener } from 'three';
import { EventEmitter } from 'events';
import { Opponent } from './Opponent';
import { useGroundHeight } from '../ground/Ground';
import socket from '@/lib/socket';
import { useWhyDidYouUpdate } from '@/lib/utils';

interface PlayerData {
  user: any;
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
}

const RemoteOpponents: React.FC<Props> = ({
  addObstacleRef,
  smoothnessRef,
  playerDataRef,
  showKillToast,
  listenerRef,
}) => {
  const playerIdsRef = useRef<string[]>([]); // Use useRef for playerIds
  const [renderTrigger, setRenderTrigger] = useState(0); // State to force re-render
  const getGroundHeight = useGroundHeight();
  const deadPlayers = useRef<Set<string>>(new Set());
  const shootEventEmitter = useRef(new EventEmitter());
  const walkingAudioRefs = useRef<Record<string, PositionalAudio>>({});
  const shootingAudioRefs = useRef<Record<string, PositionalAudio>>({});

  // Helper to update playerIds and trigger re-render
  const updatePlayerIds = (newPlayerIds: string[]) => {
    console.log("disconnected")
    playerIdsRef.current = newPlayerIds;
    setRenderTrigger((prev) => prev + 1); // Force re-render
  };

  // Socket Event Handlers
  const handlePlayerMoved = ({
    id,
    userId,
    position,
    velocity,
    cameraDirection,
  }: {
    id: string;
    userId: string;
    position: Vector3;
    velocity: Vector3;
    cameraDirection: Vector3;
  }) => {
    if (deadPlayers.current.has(id)) {
      console.log(`Player ${id} respawned, removing from dead list`);
      deadPlayers.current.delete(id);
    }

    playerDataRef.current[id] = {
      user: userId,
      position: new Vector3(position.x, position.y, position.z),
      velocity: new Vector3(velocity.x, velocity.y, velocity.z),
      cameraDirection: new Vector3(cameraDirection.x, cameraDirection.y, cameraDirection.z),
    };

    if (!playerIdsRef.current.includes(id)) {
      updatePlayerIds([...playerIdsRef.current, id]);
    }
  };

  const handlePlayerDisconnected = (id: string) => {
    console.log("handle disconnected")
    delete playerDataRef.current[id];
    deadPlayers.current.delete(id);
    updatePlayerIds(playerIdsRef.current.filter((pid) => pid !== id));
  };

  const handlePlayerDead = ({ userId, playerId }: { userId: string; playerId: string }) => {

    const user = playerDataRef.current[playerId]?.user;

    showKillToast(userId);
    deadPlayers.current.add(playerId);
    delete playerDataRef.current[playerId];
    updatePlayerIds(playerIdsRef.current.filter((id) => id !== playerId));
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
      audio.setRefDistance(5);
      audio.setMaxDistance(25);
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

  // Effect: Attach Socket Events
  useEffect(() => {
    socket.on('playerMoved', handlePlayerMoved);
    socket.on('playerDisconnected', handlePlayerDisconnected);
    socket.on('playerDead', handlePlayerDead);
    socket.on('playerShot', handlePlayerShot);
    socket.on('playerWalking', handlePlayerWalking);
    socket.on('playerStopped', handlePlayerStopped);

    return () => {
      socket.off('playerMoved', handlePlayerMoved);
      socket.off('playerDisconnected', handlePlayerDisconnected);
      socket.off('playerDead', handlePlayerDead);
      socket.off('playerShot', handlePlayerShot);
      socket.off('playerWalking', handlePlayerWalking);
      socket.off('playerStopped', handlePlayerStopped);
    };
  }, [playerDataRef]);

  return (
    <>
      {playerIdsRef.current.map((id) => {
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

export default RemoteOpponents;