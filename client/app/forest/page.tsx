'use client'
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Howl } from 'howler';
import Player from '@/components/game-components/player/TPP';
import { Vector3, Mesh, SRGBColorSpace } from 'three';
import { PointerLockControls } from '@react-three/drei';
import Ground, { useGroundHeight } from '@/components/game-components/ground/Ground';
import GameInfo from '@/components/game-components/gameInfo/GameInfo';
import socket from '@/lib/socket';
import RemoteOpponents from '@/components/game-components/player/RemoteOpponents';
import { KillFeedRenderer } from '@/components/game-components/toast/KillFeed';
import { Crosshair } from '@/components/game-components/crosshair/CrossHair';
import GameLoading from '@/components/game-components/loading-page/loading-page';
import type { Vegetation } from '../types/types';

type Player = {
  id: string;
  team?: string;
  position?: Vector3;
  velocity?: Vector3;
}


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

  const obstacles = useRef<Mesh[]>([]);
  const isPlayerDead = useRef(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const vegetationPositions = useRef<Vegetation[] | undefined>(undefined);
  const [team, setTeam] = useState<string | null>(null);
  const [hitPlayers, setHitPlayers] = useState<{ [id: string]: boolean }>({});
  const playerDataRef = useRef<{ [playerId: string]: { position: Vector3; velocity: Vector3, cameraDirection: Vector3 } }>({});
  const [localPlayerId, setLocalPlayerId] = useState("");
  const controlsRef = useRef<any>(null);

  const playerCenterRef = useRef<Vector3>(new Vector3())
  const pingRef = useRef(0);
  const smoothnessRef = useRef(0);

  const ammoRef = useRef(30);
  const grenadeCoolDownRef = useRef(false);
  const CrosshairRef = useRef(null);

  const hasJoinedRoom = useRef(false);

  const killFeedRef = useRef<{ id: number; name: any }[]>([]);
  const listenersRef = useRef<((list: any[]) => void)[]>([]);

  // Optimized settings (fixed)
  const resolutionScale = 1.0;
  const currentFov = 105;
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const [loadedComponents, setLoadedComponents] = useState<Map<string, string>>(new Map());


  const handleComponentStatusChange = (
    componentName: string,
    status: 'loading' | 'loaded' | 'failed' | 'unloaded',
    details?: { loadTime?: number; error?: string }
  ) => {
    console.log(`Component ${componentName} is ${status}`, details);
    setLoadedComponents((prev) => {
      const newMap = new Map(prev);
      newMap.set(componentName, status);
      return newMap;
    });
    // Act when Ground is loaded
    if (componentName === 'Ground' && status === 'loaded') {
      console.log('Ground is loaded! Starting minimal scene actions...');
      // Perform actions assuming Ground is enough for basic functionality
    }
  };

  const handleAllComponentsLoaded = () => {
    console.log('All components loaded! Starting full scene actions...');
    // Perform actions requiring all components (e.g., full game loop)
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
      }, 4000);
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

  function handlePlayerCenterUpdate(center: Vector3) {
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

  const addObstacleRef = useCallback((ref: Mesh | null) => {
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

  // Memoize groundProps to prevent unnecessary re-renders
  const groundProps = useMemo(() => ({
    playerCenterRef,
    addObstacleRef,
    vegetationPositions: vegetationPositions.current,
    onComponentStatusChange: handleComponentStatusChange,
    onAllComponentsLoaded: handleAllComponentsLoaded
  }), [addObstacleRef, handleComponentStatusChange, handleAllComponentsLoaded]);


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



  // Calculate actual canvas dimensions based on scale
  const canvasWidth = Math.floor(window.innerWidth * resolutionScale);
  const canvasHeight = Math.floor(window.innerHeight * resolutionScale);
  const scaleTransform = 1 / resolutionScale;

  const isGroundLoaded = loadedComponents.get('Ground') === 'loaded';

  return (
    <>
      {!isGroundLoaded && (
        <div className="fixed inset-0 z-50">
          <GameLoading />
        </div>
      )}

      <div
        className="w-full h-screen relative"
        style={{ overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
      >


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
              kills={0}
              pingRef={pingRef}
              isPlayerDead={isPlayerDead}
            />
            <Crosshair ref={CrosshairRef} />

            {/* Canvas container with scaling */}
            <div
              ref={canvasContainerRef}
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                imageRendering: resolutionScale < 1 ? 'pixelated' : 'auto'
              }}
            >
              <div style={{
                width: `${canvasWidth}px`,
                height: `${canvasHeight}px`,
                transform: `scale(${scaleTransform})`,
                transformOrigin: 'center center'
              }}>
                <Canvas
                  gl={{
                    antialias: false, // Disable AA for better performance
                    alpha: false,
                    powerPreference: "high-performance",
                    preserveDrawingBuffer: false,
                    failIfMajorPerformanceCaveat: false,
                    outputColorSpace: SRGBColorSpace,
                  }}
                  dpr={1} // Force device pixel ratio to 1
                  style={{
                    width: `${canvasWidth}px`,
                    height: `${canvasHeight}px`,
                    imageRendering: resolutionScale < 1 ? 'pixelated' : 'auto'
                  }}
                  camera={{ position: [0, 1.6, 0], fov: currentFov, near: 0.1, far: 1000 }}
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
              </div>
            </div>
          </>
        ) : (
          <div className="text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            Joining room...
          </div>
        )}
      </div>
    </>
  );
};

export default FirstPersonGame;