'use client'

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Howl } from 'howler';
import { Vector3, Mesh, SRGBColorSpace, AudioListener } from 'three';
import { PointerLockControls, Stats } from '@react-three/drei';
import { useParams, useRouter } from 'next/navigation';

import type { Vegetation } from '../../types/types';


import { useWhyDidYouUpdate } from '@/lib/utils';
import socket from '@/lib/socket';


import Player from '@/components/game-components/player/TPP';
import Ground, { useGroundHeight } from '@/components/game-components/ground/Ground';
import GameInfo from '@/components/game-components/gameInfo/GameInfo';
import RemoteOpponents from '@/components/game-components/opponents/RemoteOpponents';
import { KillFeedRenderer } from '@/components/game-components/toast/KillFeed';
import GameLoading from '@/components/game-components/loading-page/loading-page';

interface Player {
  id: string;
  team?: string;
  position?: Vector3;
  velocity?: Vector3;
}

interface ComponentStatus {
  name: string;
  status: 'loading' | 'loaded' | 'failed' | 'unloaded';
  details?: { loadTime?: number; error?: string };
}

const Game: React.FC = () => {
  // Refs
  const obstacles = useRef<Mesh[]>([]);
  const isPlayerDead = useRef(false);
  const playerDataRef = useRef<{ [playerId: string]: { user: any; position: Vector3; velocity: Vector3; cameraDirection: Vector3 } }>({});
  const playerCenterRef = useRef<Vector3>(new Vector3());
  const cameraDirectionRef = useRef<Vector3>(new Vector3(0, 0, 1));
  const pingRef = useRef(0);
  const smoothnessRef = useRef(0);
  const grenadeCoolDownRef = useRef(false);
  const crosshairRef = useRef(null);
  const controlsRef = useRef<any>(null);
  const listenerRef = useRef<AudioListener>(new AudioListener());
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const killFeedRef = useRef<{ id: number; name: string }[]>([]);
  const listenersRef = useRef<((list: { id: number; name: string }[]) => void)[]>([]);
  const toastIdRef = useRef(0);
  const vegetationPositionsRef = useRef<Vegetation[] | undefined>(undefined);

  // State
  const [roomId, setRoomId] = useState<string | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState<string>('');
  const [loadedComponents, setLoadedComponents] = useState<Map<string, string>>(new Map());
  const [vegetationPositions, setVegetationPositions] = useState<Vegetation[] | undefined>(undefined);
  const [spawnPoint, setSpawnPoint] = useState<Vector3>();
  const [gameOver, setGameOver] = useState(false);


  // Constants
  const RESOLUTION_SCALE = 1.0;
  const FOV = 105;
  const PING_CHECK_INTERVAL = 1000;
  const RESPAWN_TIMEOUT = 5000;
  const TOAST_TIMEOUT = 3000;

  const params = useParams<{ tag: string; id: string }>();
  const router = useRouter();

  // Handlers
  const handleComponentStatusChange = useCallback((componentName: string, status: ComponentStatus['status'], details?: ComponentStatus['details']) => {
    console.log(`Component ${componentName} is ${status}`, details);
    setLoadedComponents(prev => new Map(prev).set(componentName, status));
    if (componentName === 'Ground' && status === 'loaded') {
      console.log('Ground is loaded! Starting minimal scene actions...');
    }
  }, []);

  const handleAllComponentsLoaded = useCallback(() => {
    console.log('All components loaded! Starting full scene actions...');
  }, []);

  const handlePlayerCenterUpdate = useCallback((center: Vector3, cameraDirection: Vector3) => {
    playerCenterRef.current = center.clone();
    cameraDirectionRef.current = cameraDirection.clone();
  }, []);

  const showKillToast = useCallback((name: string) => {
    const id = toastIdRef.current++;
    killFeedRef.current.push({ id, name });
    listenersRef.current.forEach(cb => cb([...killFeedRef.current]));
    setTimeout(() => {
      killFeedRef.current = killFeedRef.current.filter(item => item.id !== id);
      listenersRef.current.forEach(cb => cb([...killFeedRef.current]));
    }, TOAST_TIMEOUT);
  }, []);

  const calculatePing = useCallback(() => {
    const startTime = Date.now();
    socket.emit('ping-check', startTime);
    socket.on('pong-check', (clientTime: number) => {
      const pingValue = Date.now() - clientTime;
      pingRef.current = pingValue;
      const maxPing = 500;
      const minFactor = 0.5;
      const maxFactor = 10;
      const clampedPing = Math.min(Math.max(pingValue, 0), maxPing);
      smoothnessRef.current = maxFactor - (clampedPing / maxPing) * (maxFactor - minFactor);
    });
  }, []);

  const addObstacleRef = useCallback((ref: Mesh | null) => {
    if (ref && !obstacles.current.includes(ref)) {
      obstacles.current.push(ref);
    }
  }, []);



  // Effects
  useEffect(() => {
    document.documentElement.requestFullscreen?.();
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem('justRefreshed')) {
      sessionStorage.removeItem('justRefreshed');
      socket.disconnect();
      window.location.href = '/';
    }
  }, []);

  useEffect(() => {
    fetch('/api/data')
      .then(res => res.json())
      .then(data => {
        setVegetationPositions(data);
        vegetationPositionsRef.current = data;
      });
  }, []);

  useEffect(() => {
    const hasJoinedRoom = { current: false };

    const handleConnect = async () => {
      if (!hasJoinedRoom.current) {
        hasJoinedRoom.current = true;
        setRoomId(params.id);
        setLocalPlayerId(socket.id || '124');
      }
    };

    const handleYouDied = () => {
      isPlayerDead.current = true;
      setTimeout(() => {
        isPlayerDead.current = false;
      }, RESPAWN_TIMEOUT);
    }

    const handleGameOver = () => {
      setGameOver(true);
      setTimeout(() => {
        socket.disconnect();
        router.push('/');
      }, 5000);
    }

    socket.on('connect', handleConnect);
    socket.on('youDied', handleYouDied);
    socket.on('gameOver', handleGameOver);

    if (socket.connected) {
      handleConnect();
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      sessionStorage.setItem('justRefreshed', 'true');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('youDied', handleYouDied);
      socket.off('gameOver', handleGameOver);
      socket.off('pong-check');
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [params.id]);

  useEffect(() => {
    const interval = setInterval(calculatePing, PING_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [calculatePing]);

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



  // Memoized Components and Props
  const PlayerWithGroundHeight = useMemo(() => {
    const Component: React.FC<any> = (props) => {
      const getGroundHeight = useGroundHeight();
      return (
        <Player
          {...props}
          spawnPoint={spawnPoint}
          handlePlayerCenterUpdate={handlePlayerCenterUpdate}
          playerDeadRef={isPlayerDead}
          playerCenterRef={playerCenterRef}
          controlsRef={controlsRef}
          crosshairRef={crosshairRef}
          userId={localPlayerId}
          grenadeCoolDownRef={grenadeCoolDownRef}
          roomId={roomId}
          pingRef={pingRef}
          getGroundHeight={getGroundHeight}
        />
      );
    };
    return React.memo(Component);
  }, [handlePlayerCenterUpdate, localPlayerId]);
  //

  const groundProps = useMemo(() => ({
    playerCenterRef,
    addObstacleRef,
    vegetationPositions: vegetationPositionsRef.current,
    onComponentStatusChange: handleComponentStatusChange,
    onAllComponentsLoaded: handleAllComponentsLoaded,
  }), [addObstacleRef, handleComponentStatusChange, handleAllComponentsLoaded, vegetationPositions]);

  console.log(groundProps)

  // Calculated Values
  const canvasWidth = Math.floor(window.innerWidth * RESOLUTION_SCALE);
  const canvasHeight = Math.floor(window.innerHeight * RESOLUTION_SCALE);
  const scaleTransform = 1 / RESOLUTION_SCALE;
  const isReady = roomId && Array.isArray(vegetationPositions) && vegetationPositions.length > 0;
  const isGroundLoaded = loadedComponents.get('Ground') === 'loaded';

  useWhyDidYouUpdate('Game', { roomId, localPlayerId, vegetationPositions });

  return (
    <div className="w-full h-screen relative flex justify-center items-center" style={{ overflow: 'hidden' }}>
      {!isGroundLoaded && (
        <div className="fixed inset-0 z-50">
          <GameLoading />
        </div>
      )}
      <KillFeedRenderer subscribe={(cb: (list: { id: number; name: string }[]) => void) => listenersRef.current.push(cb)} />
      {isReady ? (
        <>
          {/* <Stats /> */}
          <GameInfo
            roomId={roomId}
            grenadeCoolDownRef={grenadeCoolDownRef}
            playerCenterRef={playerCenterRef}
            cameraDirectionRef={cameraDirectionRef}
            playerDataRef={playerDataRef}
            controlsRef={controlsRef}
            crosshairRef={crosshairRef}
            userid={localPlayerId}
            bulletsAvailable={30}
            explosionTimeout={3000}
            kills={0}
            pingRef={pingRef}
            isPlayerDead={isPlayerDead}
            gameOver={gameOver}
          />
          <div
            ref={canvasContainerRef}
            style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          >
            <div style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px`, transform: `scale(${scaleTransform})`, transformOrigin: 'center center' }}>
              <Canvas
                gl={{
                  antialias: false,
                  alpha: false,
                  powerPreference: 'high-performance',
                  preserveDrawingBuffer: false,
                  failIfMajorPerformanceCaveat: false,
                  outputColorSpace: SRGBColorSpace,
                }}
                dpr={0.5}
                style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px`, imageRendering: 'pixelated' }}
                camera={{ position: [0, 0.1, 0], fov: FOV, near: 0.1, far: 1000 }}
              >
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} intensity={1} />
                <Ground {...groundProps}>
                  <PointerLockControls ref={controlsRef} />
                  <PlayerWithGroundHeight
                    obstacles={obstacles.current}
                    otherPlayers={playerDataRef}
                    listenerRef={listenerRef}
                  />
                  <RemoteOpponents
                    addObstacleRef={addObstacleRef}
                    smoothnessRef={smoothnessRef}
                    playerDataRef={playerDataRef}
                    showKillToast={showKillToast}
                    listenerRef={listenerRef}
                  />
                </Ground>
              </Canvas>
            </div>
          </div>
        </>
      ) : (
        <div className="text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">Joining room...</div>
      )}
    </div>
  );
};

export default Game;