'use client'
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { Howl } from 'howler';
import Player from '@/components/game-components/player/TPP';
import * as THREE from 'three';
import { PointerLockControls } from '@react-three/drei';
import Ground, { useGroundHeight } from '@/components/game-components/ground/Ground';
import GameInfo from '@/components/game-components/gameInfo/GameInfo';
import socket from '@/lib/socket';
import RemoteOpponents from '@/components/game-components/player/RemoteOpponents';
import { KillFeedRenderer } from '@/components/game-components/toast/KillFeed';
import { Crosshair } from '@/components/game-components/crosshair/CrossHair';
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

// Resolution presets for FPS optimization
const RESOLUTION_PRESETS = [
  { name: "Ultra Low (0.05x)", scale: 0.05, description: "Maximum FPS" },
  { name: "Low (0.25x)", scale: 0.25, description: "High FPS" },
  { name: "Medium (0.75x)", scale: 0.75, description: "Balanced" },
  { name: "High (1.0x)", scale: 1.0, description: "Full Quality" },
  { name: "Ultra (1.5x)", scale: 1.5, description: "Max Quality (Lower FPS)" },
];

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
  const controlsRef = useRef<any>(null);

  const playerCenterRef = useRef<THREE.Vector3>(new THREE.Vector3())
  const pingRef = useRef(0);
  const smoothnessRef = useRef(0);

  const ammoRef = useRef(30);
  const grenadeCoolDownRef = useRef(false);
  const CrosshairRef = useRef(null);

  const hasJoinedRoom = useRef(false);

  const killFeedRef = useRef<{ id: number; name: any }[]>([]);
  const listenersRef = useRef<((list: any[]) => void)[]>([]);

  // Resolution/FPS optimization states
  const [pixelRatio, setPixelRatio] = useState(1.0);
  const [zoomLevel, setZoomLevel] = useState(75);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  console.log("FirstPersonGame component rendered")

  // Player connection handling
  useEffect(() => {
    const handleConnect = () => {
      if (!hasJoinedRoom.current) {
        hasJoinedRoom.current = true;
        socket.emit("joinRoom", socket.id);
        setLocalPlayerId(socket.id || "124");
      }
    };

    socket.on("connect", handleConnect);

    if (socket.connected) {
      handleConnect();
    }

    socket.on("roomAssigned", ({ room, team }: any) => {
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

    socket.on("pong-check", (clientTime: any) => {
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

  function handlePlayerCenterUpdate(center: THREE.Vector3) {
    playerCenterRef.current = center.clone();
  }

  function showKillToast(name: string) {
    const id = toastId++;
    killFeedRef.current.push({ id, name });
    listenersRef.current.forEach(cb => cb([...killFeedRef.current]));

    setTimeout(() => {
      killFeedRef.current = killFeedRef.current.filter(item => item.id !== id);
      listenersRef.current.forEach(cb => cb([...killFeedRef.current]));
    }, 3000);
  }

  useEffect(() => {
    const interval = setInterval(() => {
      calculatePing();
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    obstacles.current = [];
  }, []);

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
        onCenterUpdate={handlePlayerCenterUpdate}
        playerCenterRef={playerCenterRef}
        controlsRef={controlsRef}
        crosshairRef={CrosshairRef}
        userId={localPlayerId}
        grenadeCoolDownRef={grenadeCoolDownRef}
        pingRef={pingRef}
        ammoRef={ammoRef}
        getGroundHeight={getGroundHeight}
      />
    );
  });

  const groundProps = {
    playerCenterRef,
    addObstacleRef,
    vegetationPositions: vegetationPositions.current,
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

  // Handle resolution/quality changes
  const handleQualityChange = useCallback((scale: number) => {
    setPixelRatio(scale);
  }, []);

  return (
    <div
      className="w-full h-screen relative"
      style={{ overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
    >
      {/* Quality/Resolution Controls */}
      <div style={{ 
        position: 'absolute', 
        top: '10px', 
        right: '10px', 
        zIndex: 20,
        background: 'rgba(0,0,0,0.7)',
        padding: '10px',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <div style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>
          Quality Settings
        </div>
        
        <select
          value={pixelRatio}
          onChange={(e) => handleQualityChange(Number(e.target.value))}
          style={{
            background: '#333',
            color: 'white',
            border: '1px solid #555',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '12px'
          }}
        >
          {RESOLUTION_PRESETS.map((preset) => (
            <option key={preset.scale} value={preset.scale}>
              {preset.name} - {preset.description}
            </option>
          ))}
        </select>

        <div style={{ 
          color: '#aaa', 
          fontSize: '10px',
          maxWidth: '200px',
          lineHeight: '1.2'
        }}>
          Lower values = Higher FPS but lower visual quality
        </div>

        <div style={{ color: '#aaa', fontSize: '10px' }}>
          Current: {(pixelRatio * 100).toFixed(0)}% render scale
        </div>
      </div>

      <KillFeedRenderer subscribe={(cb) => listenersRef.current.push(cb)} />
      
      {isReady ? (
        <>
          <GameInfo
            roomId={roomId}
            grenadeCoolDownRef={grenadeCoolDownRef}
            controlsRef={controlsRef}
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
          <Crosshair ref={CrosshairRef} />
          <Canvas
            gl={{
              antialias: pixelRatio >= 1.0, // Disable antialiasing on lower quality for better performance
              pixelRatio: Math.min(window.devicePixelRatio * pixelRatio, 2), // This is the key change!
              outputColorSpace: THREE.SRGBColorSpace,
            }}
            onCreated={(state) => {
              // Let the canvas fill the full screen naturally
              state.gl.domElement.style.width = '100%';
              state.gl.domElement.style.height = '100%';
              
              if ((state.camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
                cameraRef.current = state.camera as THREE.PerspectiveCamera;
              }
            }}
            camera={{ position: [0, 1.6, 0], fov: zoomLevel }}
            style={{ width: '100%', height: '100%' }} // Ensure canvas takes full size
          >
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={1} />
            <Ground {...groundProps}>
              <PointerLockControls ref={controlsRef} />
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