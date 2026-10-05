// Renders one <Opponent> per remote player. All inbound state (render list,
// transforms, event fan-out, audio refs) is owned by useArenaSocket and
// handed in as props — this file no longer touches the socket at all.
import React, { RefObject } from 'react';
import { EventEmitter } from 'events';
import { Vector3, PositionalAudio, AudioListener } from 'three';
import { Opponent } from './Opponent';

import type { RemotePlayerData, RemotePlayerSnapshot } from '@/hooks/useArenaSocket';

interface Props {
  smoothnessRef: RefObject<number>;
  playerDataRef: RefObject<Record<string, RemotePlayerData>>;
  listenerRef?: RefObject<AudioListener>;
  playerCenterRef: RefObject<Vector3>;

  playerIds: string[];
  playerUsernamesRef: RefObject<Record<string, string>>;
  snapshotRef: RefObject<Record<string, RemotePlayerSnapshot>>;
  shootEvent: EventEmitter;
  deathEvent: EventEmitter;
  hitEvent: EventEmitter;
  abilityEvent: EventEmitter;
  setAudioRef: (userId: string, audio: PositionalAudio) => void;
  setShootAudioRef: (userId: string, audio: PositionalAudio) => void;
}

const RemoteOpponents: React.FC<Props> = ({
  smoothnessRef,
  playerDataRef,
  listenerRef,
  playerCenterRef,
  playerIds,
  playerUsernamesRef,
  snapshotRef,
  shootEvent,
  deathEvent,
  hitEvent,
  abilityEvent,
  setAudioRef,
  setShootAudioRef,
}) => {
  return (
    <>
      {playerIds.map((id) => {
        const data = playerDataRef.current[id];
        // dead players stay mounted on purpose: unmounting here would cut the
        // death explosion off. useArenaSocket cleans them up once it's done.
        if (!data) return null;

        return (
          <Opponent
            key={id}
            position={() => playerDataRef.current[id]?.position || null}
            velocity={() => playerDataRef.current[id]?.velocity || null}
            cameraDirection={() => playerDataRef.current[id]?.cameraDirection || null}
            getLatestSnapshot={() => snapshotRef.current[id] || null}
            shootEvent={shootEvent}
            deathEvent={deathEvent}
            hitEvent={hitEvent}
            abilityEvent={abilityEvent}
            userId={id}
            username={playerUsernamesRef.current?.[id] ?? ''}
            smoothnessRef={smoothnessRef}
            listener={listenerRef?.current}
            setAudioRef={setAudioRef}
            setShootAudioRef={setShootAudioRef}
            localPlayerPositionRef={playerCenterRef}
          />
        );
      })}
    </>
  );
};

export default RemoteOpponents;
