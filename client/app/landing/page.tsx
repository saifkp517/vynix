'use client'
import React, { useRef, useState, useEffect } from 'react';
import { Forest } from '@/components/game-components/obstacles/ForestGenerator';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import Player from '@/components/game-components/player/Player';
import * as THREE from 'three';
import { Stats } from '@react-three/drei';
import Ground from '@/components/game-components/ground/Ground';
import socket from '@/lib/socket';
import { Opponent } from '@/components/game-components/player/Opponent';

// Define types for player and obstacle


interface ObstacleProps {
  position: [number, number, number];
  getGroundHeight: (x: number, z: number) => number;
}

const Crosshair = () => (
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
);


// Obstacle component with forwarded ref using a Cylinder
const Obstacle = React.forwardRef<THREE.Mesh, ObstacleProps>(({ position, getGroundHeight }, ref) => {
  return (
    <mesh ref={ref} position={position}>
      {/* <cylinderGeometry args={[1.75, 1.75, 1.5, 32]} />  */}
      {/* <sphereGeometry args={[5.75]} /> */}
      <boxGeometry args={[10, 5, 3]} />
      <meshStandardMaterial color="red" />
    </mesh>
  );
});

const SphereObstacle = React.forwardRef<THREE.Mesh, ObstacleProps>(({ position, getGroundHeight }, ref) => {
  return (
    <mesh ref={ref} position={position}>
      {/* <cylinderGeometry args={[1.75, 1.75, 1.5, 32]} />  */}
      <sphereGeometry args={[3]} />
      {/* <boxGeometry args={[10, 5, 3]} /> */}
      <meshStandardMaterial color="red" />
    </mesh>
  );
});

const CylinderObstacle = React.forwardRef<THREE.Mesh, ObstacleProps>(({ position, getGroundHeight }, ref) => {
  return (
    <mesh ref={ref} position={position} rotation={[-Math.PI / 2, 0, 0]} >
      <cylinderGeometry args={[1.75, 1.75, 15.5, 32]} />
      <meshStandardMaterial color="red" />
    </mesh>

  );
});

const CylinderObstacleVerticle = React.forwardRef<THREE.Mesh, ObstacleProps>(({ position, getGroundHeight }, ref) => {
  return (
    <mesh ref={ref} position={position} >
      <cylinderGeometry args={[1.75, 1.75, 15.5, 32]} />
      <meshStandardMaterial color="red" />
    </mesh>

  );
});


// Main game component
const FirstPersonGame: React.FC = () => {
  const obstacles = useRef<THREE.Mesh[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const [otherPlayers, setOtherPlayers] = useState<{ [playerId: string]: THREE.Vector3 }>({});



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


  //player connection handling
  useEffect(() => {
    const handleConnect = () => {
      console.log("Socket connected:", socket.id);
      socket.emit("joinRoom", socket.id);
    };

    // Handle the connect event
    socket.on("connect", handleConnect);

    // If already connected (like when opening a new tab), join immediately
    if (socket.connected) {
      handleConnect();
    }

    // Room and team assignment
    socket.on("roomAssigned", ({ roomId, team }) => {
      console.log(`Assigned to room: ${roomId}`);
      setRoomId(roomId);
      setTeam(team);
    });

    socket.on("playerMoved", ({ id, position }) => {
      console.log("plauersmoved", id, position);
      setOtherPlayers(prevPlayers => ({
        ...prevPlayers,
        [id]: position,
      }));
    })

    socket.on("disconnect", (id) => {
      setOtherPlayers((prev) => {
        const updated: any = { ...prev };
        delete updated[id];
        return updated;
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
      socket.off("playerMoved");
      socket.off("disconnect");
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);




  // Setup obstacle references
  useEffect(() => {
    obstacles.current = [];
  }, []);

  // Add an obstacle to the collection
  const addObstacleRef = React.useCallback((ref: THREE.Mesh | null) => {
    if (ref && !obstacles.current.includes(ref)) {
      obstacles.current.push(ref);
    }
  }, []);


  return (
    <div className="w-full h-screen relative">
      {/* {!gameStarted ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 z-20">
          <div className="bg-white p-6 rounded shadow-lg text-center">
            <h2 className="text-2xl mb-4">First-Person Collision Detection</h2>
            <p className="mb-4">Click to start. Use WASD to move and mouse to look around.</p>
            <button 
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              onClick={() => setGameStarted(true)}
            >
              Start Game
            </button>
          </div>
        </div>
      ) : null} */}

      {/* Instructions */}
      <div className="absolute top-4 left-4 bg-white text-black p-2 z-10">
        <p>WASD to move, Mouse to look</p>
        <p className="text-sm">Press ESC to release mouse</p>
        <p>Room Id: {roomId}</p>
        <p>Team: {team}</p>
      </div>
      <Crosshair />

      {/* 3D Canvas */}
      <Canvas camera={{ position: [0, 1.6, 0], fov: 75 }}>
        <Stats />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <gridHelper args={[50, 50]} />

        <Ground fogDistance={200} fogColor="#65888a">
          {(getGroundHeight) => (
            <>
              <Player
                onPositionChange={(pos) => {
                  socket.emit("updatePosition", pos);
                }}
                obstacles={obstacles.current}
                getGroundHeight={getGroundHeight}
                otherPlayers={otherPlayers || {}}
              />

              {/* Other players */}
              {Object.entries(otherPlayers).map(([id, pos]) => (
                <Opponent
                  key={id}
                  initialPosition={pos}
                  onPositionChange={(pos) => {
                    socket.emit("updatePosition", pos);
                  }}
                  isRemote
                  getGroundHeight={getGroundHeight}
                  addObstacleRef={addObstacleRef}
                />
              ))}
              {/* Small banyan grove */}
              {/* <Forest
                center={[80, 0, -40]}
                radius={100}
                density={0.01}
                types={["banyan"]} // Only banyan trees
                getGroundHeight={getGroundHeight}
                addObstacleRef={addObstacleRef}

              /> */}
            </>

          )}
        </Ground>
      </Canvas>
    </div>
  );
};

export default FirstPersonGame;