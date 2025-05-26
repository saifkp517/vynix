'use client'
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { Howl } from 'howler';
import Player from '@/components/game-components/player/Player';
import * as THREE from 'three';
import { Stats } from '@react-three/drei';
import Ground, { useGroundHeight } from '@/components/game-components/ground/Ground';
import GameInfo from '@/components/game-components/gameInfo/GameInfo';
import socket from '@/lib/socket';
import RemoteOpponents from '@/components/game-components/player/RemoteOpponents';
import KillFeed from '@/components/game-components/toast/KillFeed';

import type { Vegetation } from '../types/types';

// Define types for player and obstacle
interface ObstacleProps {
  position: [number, number, number];
  getGroundHeight: (x: number, z: number) => number;
}

type Player = {
  id: string;
  team?: string;
  position?: THREE.Vector3;
  velocity?: THREE.Vector3;
}

type Room = {
  roomId: string;
  players: Player[];
  maxPlayers: number;
  gameStarted: boolean;
}

const Crosshair = React.memo(() => (
  <div style={{
    position: 'fixed',
    top: '50%',
    left: '50%',
    width: '4px',
    height: '4px',
    backgroundColor: 'red',
    transform: 'translate(-50%, -50%)',
    zIndex: 1000,
  }} />
));

// Main game component
const FirstPersonGame: React.FC = () => {

  function useWhyDidYouUpdate(componentName: string, props: any) {
    const previousProps = useRef<any>({});

    useEffect(() => {
      const allKeys = Object.keys({ ...previousProps.current, ...props });
      const changesObj: any = {};

      allKeys.forEach(key => {
        if (previousProps.current[key] !== props[key]) {
          changesObj[key] = {
            from: previousProps.current[key],
            to: props[key],
          };
        }
      });

      if (Object.keys(changesObj).length) {
        console.log(`[why-did-you-update] ${componentName}`, changesObj);
      }

      previousProps.current = props;
    });
  }



  const obstacles = useRef<THREE.Mesh[]>([]);
  const isPlayerDead = useRef(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const vegetationPositions = useRef<Vegetation[] | undefined>(undefined);
  const [team, setTeam] = useState<string | null>(null);
  const [hitPlayers, setHitPlayers] = useState<{ [id: string]: boolean }>({});
  const playerDataRef = useRef<{ [playerId: string]: { position: THREE.Vector3; velocity: THREE.Vector3 } }>({});
  const [localPlayerId, setLocalPlayerId] = useState("");
  // We need to keep a state to force re-renders when players join/leave
  const playerIdsRef = useRef<string[]>([]);

  const pingRef = useRef(0);
  const smoothnessRef = useRef(0);

  //grandparent states to communicate data with children
  const ammoRef = useRef(10);
  const grenadeCoolDownRef = useRef(false);


  //prevent multiple joins requests by same user
  const hasJoinedRoom = useRef(false);


  const killFeedRef = useRef<{ id: number; name: any }[]>([]);




  console.log("FirstPersonGame component rendered");


  const addPlayerId = (id: string) => {
    if (!playerIdsRef.current.includes(id)) {
      playerIdsRef.current.push(id);
    }
  };

  const removePlayerId = (id: string) => {
    playerIdsRef.current = playerIdsRef.current.filter((pid) => pid !== id);
  };

  // Player connection handling
  useEffect(() => {
    const handleConnect = () => {
      if (!hasJoinedRoom.current) {
        hasJoinedRoom.current = true;
        socket.emit("joinRoom", socket.id);
        setLocalPlayerId(socket.id || "124");
      }
    };

    // Handle the connect event
    socket.on("connect", handleConnect);

    // If already connected (like when opening a new tab), join immediately
    if (socket.connected) {
      handleConnect();
    }

    // Room and team assignment
    socket.on("roomAssigned", ({ room, team }) => {
      console.log(`Assigned to room: ${room.id}`);
      setRoomId(room.id);
      vegetationPositions.current = room.vegetationPositions
      setTeam(team);
    });

    socket.on("youDied", () => {
      console.log("you died");
      isPlayerDead.current = true;

      setTimeout(() => {
        isPlayerDead.current = false;
      }, 5000);
    });

  
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      window.location.href = '/';
      socket.disconnect();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("roomAssigned");
      socket.off("disconnect");
      socket.off("joinedRoom");
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  function calculatePing() {
    const startTime = Date.now();

    socket.emit("ping-check", startTime);

    socket.on("pong-check", (clientTime) => {
      const endTime = Date.now();
      const pingValue = endTime - clientTime;
      pingRef.current = pingValue;

      const minFactor = 0.5;
      const maxFactor = 10;
      const maxPing = 500;

      const ping = pingRef.current || 0;

      const clampedPing = Math.min(Math.max(ping, 0), maxPing);

      const interpolationFactor = maxFactor - (clampedPing / maxPing) * (maxFactor - minFactor);

      smoothnessRef.current = interpolationFactor;

    })
  }

  let toastId = 0;


  function showKillToast(name: string) {
    const id = toastId++;
    killFeedRef.current = [...killFeedRef.current, { id, name }];

    setTimeout(() => {
      killFeedRef.current = killFeedRef.current.filter(item => item.id !== id);
    }, 3000);
  }


  useEffect(() => {
    const interval = setInterval(() => {
      calculatePing();
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Setup obstacle references
  useEffect(() => {
    obstacles.current = [];
  }, []);

  // Sound effect
  useEffect(() => {
    const sound = new Howl({
      src: ['/sounds/breeze.mp3'],
      volume: 1,
      preload: true,
      loop: true,
    });
    sound.play();
    return () => {
      sound.stop();
    };
  }, []);

  // Add an obstacle to the collection
  const addObstacleRef = useCallback((ref: THREE.Mesh | null) => {
    if (ref && !obstacles.current.includes(ref)) {
      obstacles.current.push(ref);
    }
  }, []);

  const PlayerWithGroundHeight = React.memo((props: any) => {
    const getGroundHeight = useGroundHeight();

    return (
      <Player
        {...props}
        userId={localPlayerId}
        grenadeCoolDownRef={grenadeCoolDownRef}
        pingRef={pingRef} //pass ping to gun component for sending during shoot events
        ammoRef={ammoRef}
        getGroundHeight={getGroundHeight}
      />
    );
  });



  const groundProps = {
    addObstacleRef,
    fogDistance: 25,
    vegetationPositions: vegetationPositions.current,
    fogColor: "#65888a"
  };


  const isReady =
    typeof roomId === "string" &&
    Array.isArray(vegetationPositions.current) &&
    vegetationPositions.current.length > 0;

  useWhyDidYouUpdate("FirstPersonGame", {
    roomId,
    team,
    hitPlayers,
    localPlayerId,
    vegetationPositions,
  });

  return (
    <div className="w-full h-screen relative">
      {killFeedRef.current.map(item => (
        <KillFeed key={item.id} feed={killFeedRef.current} />
      ))}
      {isReady ? (
        <>
          <GameInfo
            roomId={roomId}
            grenadeCoolDownRef={grenadeCoolDownRef}
            userid={localPlayerId}
            team={team}
            ammoRef={ammoRef}
            bulletsAvailable={30}
            explosionTimeout={3000}
            health={100}
            kills={0}
            pingRef={pingRef}
            isPlayerDead={isPlayerDead}
          />
          <Crosshair />

          <Canvas camera={{ position: [0, 1.6, 0], fov: 75 }}>
            <Stats />
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={1} />
            <gridHelper args={[50, 50]} />

            <Ground {...groundProps}>
              <PlayerWithGroundHeight
                addObstacleRef={addObstacleRef}
                obstacles={obstacles.current}
                otherPlayers={playerDataRef}
              />

              <RemoteOpponents
                hitPlayers={hitPlayers}
                addObstacleRef={addObstacleRef}
                smoothnessRef={smoothnessRef}
                playerDataRef={playerDataRef}
                showKillToast={showKillToast}
              />

            </Ground>
          </Canvas>
        </>
      ) : (
        <div className="text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          Joining room...
        </div>
      )}
    </div>
  );
};

export default FirstPersonGame;