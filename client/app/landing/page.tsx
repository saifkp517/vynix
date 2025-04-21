'use client'
import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import Player from '@/components/game-components/player/Player';
import * as THREE from 'three';
import { Stats } from '@react-three/drei';
import Ground from '@/components/game-components/ground/Ground';
import socket from '@/lib/socket';

// Define types for player and obstacle


interface ObstacleProps {
  position: [number, number, number];
  getGroundHeight: (x: number, z: number) => number;
}



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

    socket.on("connect", () => {
      console.log("Connected to server");

      socket.emit("joinRoom", (socket.id));

    });

    socket.on("roomAssigned", ({ roomId, team }) => {
      console.log(`Assigned to room: ${roomId}: `);
      setRoomId(roomId);
      setTeam(team);

    });

    socket.on("disconnect", () => {
      console.log("Disconnected from server");
    });


    return () => {
      socket.off("connect");
      socket.off("roomAssigned");
      socket.off("disconnect");
    };

  }, [])

  //prevent window refresh
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome requires returnValue to be set
      e.returnValue = '';
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);



  // Setup obstacle references
  useEffect(() => {
    obstacles.current = [];
  }, []);

  // Add an obstacle to the collection
  const addObstacleRef = (ref: THREE.Mesh | null) => {
    if (ref && !obstacles.current.includes(ref)) {
      obstacles.current.push(ref);
    }
  };


  // Check for collisions with all obstacles




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

      <Canvas camera={{ position: [0, 1.6, 0], fov: 75 }}>
        <Stats />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <gridHelper args={[50, 50]} />

        <Ground fogDistance={25} fogColor="#CEDFE0">
          {(getGroundHeight) => (
            <>
              <Player
                // key={id}
                onPositionChange={(pos) => {
                  socket.emit("updatePosition", pos.toArray());
                }}
                obstacles={obstacles.current}
                getGroundHeight={getGroundHeight}
              />

              <Obstacle position={[15, 1, 0]} getGroundHeight={getGroundHeight} ref={addObstacleRef} />
              <SphereObstacle position={[-15, 1, 0]} getGroundHeight={getGroundHeight} ref={addObstacleRef} />
              <CylinderObstacle position={[-30, 1, 5]} getGroundHeight={getGroundHeight} ref={addObstacleRef} />
              <CylinderObstacleVerticle position={[-25, 1, 5]} getGroundHeight={getGroundHeight} ref={addObstacleRef} />

            </>
          )}

        </Ground>
      </Canvas>
    </div>
  );
};

export default FirstPersonGame;