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

// Define types for player and obstacle
interface ObstacleProps {
  position: [number, number, number];
  getGroundHeight: (x: number, z: number) => number;
}

interface TreePosition {
  position: [number, number, number];
  rotation: number;
  scale: number;
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
  const treePositions = useRef<TreePosition[] | undefined>(undefined);
  const [team, setTeam] = useState<string | null>(null);
  const [hitPlayers, setHitPlayers] = useState<{ [id: string]: boolean }>({});
  const playerPositionsRef = useRef<{ [playerId: string]: THREE.Vector3 }>({});
  // We need to keep a state to force re-renders when players join/leave
  const [playerIds, setPlayerIds] = useState<string[]>([]);

  type Player = {
    id: string;
    team?: string;
    position?: THREE.Vector3;
  }

  type Room = {
    roomId: string;
    players: Player[];
    maxPlayers: number;
    gameStarted: boolean;
  }

  //prevent multiple joins requests by same user
  const hasJoinedRoom = useRef(false);

  // Player connection handling
  useEffect(() => {
    const handleConnect = () => {
      if (!hasJoinedRoom.current) {
        hasJoinedRoom.current = true;
        socket.emit("joinRoom", socket.id);
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
      treePositions.current = room.treePositions
      setTeam(team);
    });

    socket.on("playerMoved", ({ id, position }) => {
      // console.log("Player moved:", id, position);

      // Store position in ref to avoid re-renders
      playerPositionsRef.current = {
        ...playerPositionsRef.current,
        [id]: new THREE.Vector3(position.x, position.y, position.z)
      };

      // Update player IDs if this is a new player
      if (!playerIds.includes(id)) {
        setPlayerIds(prev => [...prev, id]);
      }
    });

    socket.on("disconnect", (id) => {
      const updated = { ...playerPositionsRef.current };
      delete updated[id];
      playerPositionsRef.current = updated;

      // Update player IDs when a player leaves
      setPlayerIds(prev => prev.filter(playerId => playerId !== id));
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
      socket.off("playerMoved");
      socket.off("disconnect");
      socket.off("joinedRoom");
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
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
        getGroundHeight={getGroundHeight}
      />
    );
  });

  // Example Opponent component that uses the useGroundHeight hook
  const OpponentWithGroundHeight = React.memo(
    ({ playerId, addObstacleRef, isHit }: { playerId: string, addObstacleRef: any, isHit: boolean }) => {
      const getGroundHeight = useGroundHeight();
      const positionRef = useRef<THREE.Vector3 | null>(null);

      useEffect(() => {
        positionRef.current = playerPositionsRef.current[playerId] || null;
      }, [playerId]);

      if (!playerPositionsRef.current[playerId]) return null;

      return (
        <Opponent
          positionRef={() => playerPositionsRef.current[playerId]} // Pass as a function
          isRemote={true}
          addObstacleRef={addObstacleRef}
          isHit={isHit}
          getGroundHeight={getGroundHeight}
        />
      );
    }
  );

  const groundProps = {
    addObstacleRef,
    fogDistance: 20,
    treePositions: treePositions.current,
    fogColor: "#65888a"
  };


  const isReady =
    typeof roomId === "string" &&
    Array.isArray(treePositions.current) &&
    treePositions.current.length > 0;


  return (
    <div className="w-full h-screen relative">
      {isReady ? (
        <>
          <GameInfo
            roomId={roomId}
            team={team}
            bulletsInChamber={6}
            bulletsAvailable={30}
            explosionTimeout={3000}
            health={100}
            kills={0}
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
                otherPlayers={playerPositionsRef.current}
              />

              {playerIds.map((id) => (
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