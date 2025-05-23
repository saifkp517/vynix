'use client'
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Howl } from 'howler';
import Player from '@/components/game-components/player/Player';
import * as THREE from 'three';
import { Stats } from '@react-three/drei';
import Ground, { useGroundHeight } from '@/components/game-components/ground/Ground';
import GameInfo from '@/components/game-components/gameInfo/GameInfo';
import socket from '@/lib/socket';
import { Opponent } from '@/components/game-components/player/Opponent';
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

// Obstacle components with memoization
const Obstacle = React.memo(React.forwardRef<THREE.Mesh, ObstacleProps>(({ position, getGroundHeight }, ref) => {
  return (
    <mesh ref={ref} position={position}>
      <boxGeometry args={[10, 5, 3]} />
      <meshStandardMaterial color="red" />
    </mesh>
  );
}));

const SphereObstacle = React.memo(React.forwardRef<THREE.Mesh, ObstacleProps>(({ position, getGroundHeight }, ref) => {
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[3]} />
      <meshStandardMaterial color="red" />
    </mesh>
  );
}));

const CylinderObstacle = React.memo(React.forwardRef<THREE.Mesh, ObstacleProps>(({ position, getGroundHeight }, ref) => {
  return (
    <mesh ref={ref} position={position} rotation={[-Math.PI / 2, 0, 0]} >
      <cylinderGeometry args={[1.75, 1.75, 15.5, 32]} />
      <meshStandardMaterial color="red" />
    </mesh>
  );
}));

const CylinderObstacleVerticle = React.memo(React.forwardRef<THREE.Mesh, ObstacleProps>(({ position, getGroundHeight }, ref) => {
  return (
    <mesh ref={ref} position={position} >
      <cylinderGeometry args={[1.75, 1.75, 15.5, 32]} />
      <meshStandardMaterial color="red" />
    </mesh>
  );
}));

// Main game component
const FirstPersonGame: React.FC = () => {

  console.log("FirstPersonGame component rendered");
  const obstacles = useRef<THREE.Mesh[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const vegetationPositions = useRef<Vegetation[] | undefined>(undefined);
  const [team, setTeam] = useState<string | null>(null);
  const [hitPlayers, setHitPlayers] = useState<{ [id: string]: boolean }>({});
  const playerDataRef = useRef<{ [playerId: string]: { position: THREE.Vector3; velocity: THREE.Vector3 } }>({});
  const [localPlayerId, setLocalPlayerId] = useState("");
  // We need to keep a state to force re-renders when players join/leave
  const [playerIds, setPlayerIds] = useState<string[]>([]);
  const pingRef = useRef(0);
  const smoothnessRef = useRef(0);

  //grandparent states to communicate data with children
  const ammoRef = useRef(10);
  const grenadeCoolDownRef = useRef(false);


  //prevent multiple joins requests by same user
  const hasJoinedRoom = useRef(false);


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
    socket.on("playerMoved", ({ id, position, velocity }) => {

      console.log("Opponent Velocity: ", velocity)

      // Store position and velocity in ref to avoid re-renders
      playerDataRef.current = {
        ...playerDataRef.current,
        [id]: {
          position: new THREE.Vector3(position.x, position.y, position.z),
          velocity: new THREE.Vector3(velocity.x, velocity.y, velocity.z),
        },
      };


      // Trigger re-render if this is a new player
      setPlayerIds((prevIds) => {
        if (!prevIds.includes(id)) {
          return [...prevIds, id];
        }
        return prevIds; // no change, no re-render
      });

    });


    socket.on("playerDead", ({ userId, playerId }) => {
      console.log(`${playerId} was killed by ${userId}`);
      showKillToast(`💀 ${playerId}`);

      // Remove the player temporarily
      const updated = { ...playerDataRef.current };
      delete updated[playerId];
      playerDataRef.current = updated;

      // Optional: remove from rendering logic if needed
      setPlayerIds((prevIds) => prevIds.filter(id => id !== playerId));

      // Set respawn timer (e.g. 3 seconds)
      setTimeout(() => {
        playerDataRef.current[playerId] = {
          position: new THREE.Vector3(0, 0, 0),
          velocity: new THREE.Vector3(0, 0, 0),
        };

        setPlayerIds((prevIds) => {
          if (!prevIds.includes(playerId)) {
            return [...prevIds, playerId];
          }
          return prevIds;
        });
      }, 10000); // 3 seconds
    });


    socket.on("playerDisconnected", (id) => {
      const updated = { ...playerDataRef.current };
      delete updated[id];
      playerDataRef.current = updated;

      // Update player IDs when a player leaves
      setPlayerIds((prevIds) => {
        if (!prevIds.includes(id)) {
          return [...prevIds, id];
        }
        return prevIds; // no change, no re-render
      });
    });

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome requires returnValue to be set
      e.returnValue = '';
      window.location.href = '/';
      socket.disconnect();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("roomAssigned");
      socket.off("playerDead"); ``
      socket.off("playerMoved");
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

  const [killFeed, setKillFeed] = useState<{ id: number; name: any }[]>([]);
  let toastId = 0;


  function showKillToast(name: string) {
    const id = toastId++;
    setKillFeed((prev) => [...prev, { id, name }]);

    setTimeout(() => {
      setKillFeed((prev) => prev.filter((item) => item.id !== id));
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

  // Example Opponent component that uses the useGroundHeight hook
  const OpponentWithGroundHeight = React.memo(

    ({ playerId, addObstacleRef, isHit }: { playerId: string, addObstacleRef: any, isHit: boolean }) => {
      const getGroundHeight = useGroundHeight();
      const positionRef = useRef<THREE.Vector3 | null>(null);
      const velocityRef = useRef<THREE.Vector3 | null>(null);

      console.log("Rendering OpponentWithGroundHeight for:", playerId);
      useEffect(() => {
        positionRef.current = playerDataRef.current[playerId]?.position || null;
        velocityRef.current = playerDataRef.current[playerId]?.velocity || null;
      }, [playerId]);

      if (!playerDataRef.current[playerId]) return null;

      return (
        <Opponent
          positionRef={() => playerDataRef.current[playerId]?.position || null} // Pass as a function
          velocityRef={() => playerDataRef.current[playerId]?.velocity || null} // Pass as a function}
          isRemote={true}
          addObstacleRef={addObstacleRef}
          smoothnessRef={smoothnessRef}
          isHit={isHit}
          getGroundHeight={getGroundHeight}
        />
      );
    }
  );

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

  return (
    <div className="w-full h-screen relative">
      <KillFeed feed={killFeed} />
      {isReady ? (
        <>
          {/* <GameInfo
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
          /> */}
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

              {playerIds
                .map((id) => (
                  <OpponentWithGroundHeight
                    key={id}
                    playerId={id}
                    addObstacleRef={addObstacleRef}
                    isHit={!!hitPlayers[id]}
                  />
                ))}
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