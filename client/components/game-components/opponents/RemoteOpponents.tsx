import React, { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Vector3, Mesh, PositionalAudio, AudioListener } from 'three';
import { EventEmitter } from 'events';
import { Opponent } from './Opponent';
import socket from '@/lib/socket';

import { useRoomStore } from '@/hooks/useRoomStore';

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
  playerCenterRef: RefObject<Vector3>;
}

const RemoteOpponents: React.FC<Props> = ({
  addObstacleRef,
  smoothnessRef,
  playerDataRef,
  showKillToast,
  listenerRef,
  playerCenterRef
}) => {
  // stable list for rendering
  const [playerIds, setPlayerIds] = useState<string[]>([]);
  const playerIdsRef = useRef<string[]>([]); // mirrors state for fast checks
  const playerUsernamesRef = useRef<Record<string, string>>({}); // id -> username

  const deadPlayers = useRef<Set<string>>(new Set());
  const shootEventEmitter = useRef(new EventEmitter());
  const deathEventEmitter = useRef(new EventEmitter());
  const walkingAudioRefs = useRef<Record<string, PositionalAudio>>({});
  const shootingAudioRefs = useRef<Record<string, PositionalAudio>>({});

  // Helpers: add / remove players (keeps ref + state in sync)
  const addPlayer = useCallback((id: string, username?: string) => {
    if (!playerIdsRef.current.includes(id)) {
      playerIdsRef.current.push(id);
      if (username) playerUsernamesRef.current[id] = username;
      setPlayerIds([...playerIdsRef.current]);
    } else if (username) {
      // update username if changed
      playerUsernamesRef.current[id] = username;
      // no rerender required for username change unless Opponent depends on it visually
      setPlayerIds(prev => [...prev]); // small nudge if you want re-render on username change
    }
  }, []);

  const removePlayer = useCallback((id: string) => {
    if (playerIdsRef.current.includes(id)) {
      playerIdsRef.current = playerIdsRef.current.filter(pid => pid !== id);
      delete playerUsernamesRef.current[id];

      // stop & cleanup audio nodes for this player if present
      const walkAudio = walkingAudioRefs.current[id];
      if (walkAudio) {
        try { if (walkAudio.isPlaying) walkAudio.stop(); } catch (_) { }
        delete walkingAudioRefs.current[id];
      }
      const shootAudio = shootingAudioRefs.current[id];
      if (shootAudio) {
        try { if (shootAudio.isPlaying) shootAudio.stop(); } catch (_) { }
        delete shootingAudioRefs.current[id];
      }

      // remove player data
      delete playerDataRef.current[id];
      deadPlayers.current.delete(id);

      setPlayerIds([...playerIdsRef.current]);
    }
  }, [playerDataRef]);

  // Socket Event Handlers (created once on mount)
  useEffect(() => {
    const handlePlayerMoved = (payload: {
      id: string;
      userId?: string; // preserved for compatibility
      username?: string;
      position: { x: number; y: number; z: number };
      velocity: { x: number; y: number; z: number };
      cameraDirection: { x: number; y: number; z: number };
    }) => {
      const { id, username, position, velocity, cameraDirection } = payload;

      if (deadPlayers.current.has(id)) {
        // If they were marked dead but we now get movement => consider respawn
        deadPlayers.current.delete(id);
      }

      // update player data ref (do not use setState here; heavy data in ref)
      playerDataRef.current[id] = {
        user: payload.userId ?? id,
        position: new Vector3(position.x, position.y, position.z),
        velocity: new Vector3(velocity.x, velocity.y, velocity.z),
        cameraDirection: new Vector3(cameraDirection.x, cameraDirection.y, cameraDirection.z),
      };

      addPlayer(id, username);
    };

    const handlePlayerDisconnected = (id: string) => {
      removePlayer(id);

      // remove from centralized room store if applicable
      try {
        useRoomStore.getState().removePlayer(id);
      } catch (e) {
        // ignore if store doesn't have removePlayer
        // console.warn('removePlayer not available on room store', e);
      }
    };

    const handlePlayerDead = (payload: { killerSocketId: string; victimSocketId: string; killerName: string; victimName: string }) => {
      const { killerSocketId, victimSocketId, killerName } = payload;
      if (killerSocketId === socket.id) {
        showKillToast(killerName);
      }
      deathEventEmitter.current.emit('playDeathAnimation', {
        id: victimSocketId,
      })

      deadPlayers.current.add(victimSocketId);
      
      // 👇 remove player after short delay (enough for animation to finish)
      setTimeout(() => {
        removePlayer(victimSocketId);
      }, 1500);
    };

    const handlePlayerShot = (payload: { id: string; rayOrigin: { x: number; y: number; z: number }; rayDirection: { x: number; y: number; z: number } }) => {
      const { id, rayOrigin, rayDirection } = payload;
      if (deadPlayers.current.has(id)) return;
      shootEventEmitter.current.emit('playerShot', {
        id,
        rayOrigin: new Vector3(rayOrigin.x, rayOrigin.y, rayOrigin.z),
        rayDirection: new Vector3(rayDirection.x, rayDirection.y, rayDirection.z),
      });
    };

    const handlePlayerWalking = (payload: { userId: string }) => {
      const audio = walkingAudioRefs.current[payload.userId];
      if (audio && !audio.isPlaying) {
        audio.setMaxDistance(25);
        audio.setLoop(true);
        audio.setVolume(1);
        audio.play();
      }
    };

    const handlePlayerStopped = (payload: { userId: string }) => {
      const audio = walkingAudioRefs.current[payload.userId];
      if (audio && audio.isPlaying) {
        audio.stop();
      }
    };

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
  }, [addPlayer, removePlayer, playerDataRef, showKillToast]);

  // stable function to hand audio refs to Opponent children
  const setAudioRef = useCallback((userId: string, audio: PositionalAudio) => {
    walkingAudioRefs.current[userId] = audio;
  }, []);

  // render Opponent components for current playerIds
  return (
    <>
      {playerIds.map((id) => {
        const data = playerDataRef.current[id];
        const isDead = deadPlayers.current.has(id);
        if (!data || isDead) return null;

        return (
          <Opponent
            key={id}
            position={() => playerDataRef.current[id]?.position || null}
            velocity={() => playerDataRef.current[id]?.velocity || null}
            cameraDirection={() => playerDataRef.current[id]?.cameraDirection || null}
            shootEvent={shootEventEmitter.current}
            deathEvent={deathEventEmitter.current}
            userId={id}
            username={playerUsernamesRef.current[id] ?? ''}
            addObstacleRef={addObstacleRef}
            smoothnessRef={smoothnessRef}
            listener={listenerRef?.current}
            setAudioRef={setAudioRef}
            localPlayerPositionRef={playerCenterRef}
          />
        );
      })}
    </>
  );
};

export default RemoteOpponents;
