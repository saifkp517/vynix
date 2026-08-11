'use client'

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
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
import HitImpact from '@/components/game-components/player/HitImpact';
import KillCam from '@/components/game-components/player/KillCam';
import { KillFeedRenderer } from '@/components/game-components/toast/KillFeed';
import GameLoading from '@/components/game-components/loading-page/loading-page';
import { getLoopingSound, stopAllSounds } from '@/lib/sound';

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
  const killerIdRef = useRef<string | null>(null);
  const playerDataRef = useRef<{ [playerId: string]: { user: any; position: Vector3; velocity: Vector3; cameraDirection: Vector3 } }>({});
  const playerCenterRef = useRef<Vector3>(new Vector3());
  const cameraDirectionRef = useRef<Vector3>(new Vector3(0, 0, 1));
  const pingRef = useRef(0);
  const smoothnessRef = useRef(0);
  const grenadeCoolDownRef = useRef(false);
  const disconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const crosshairRef = useRef(null);
  const controlsRef = useRef<any>(null);
  const listenerRef = useRef<AudioListener>(new AudioListener());
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const killFeedRef = useRef<{ id: number; name: string; streak: number }[]>([]);
  const listenersRef = useRef<((list: { id: number; name: string; streak: number }[]) => void)[]>([]);
  const toastIdRef = useRef(0);
  const killStreakRef = useRef(0);
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
    killStreakRef.current++;
    killFeedRef.current.push({ id, name, streak: killStreakRef.current });
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

  // Paired with addObstacleRef: without a way to remove a mesh, every
  // tree/rock that ever scrolled into view stayed in the obstacles array
  // forever — see useColliderRefs for the full story on why that happened
  // and why it silently only got worse as a session went on.
  const removeObstacleRef = useCallback((ref: Mesh) => {
    const index = obstacles.current.indexOf(ref);
    if (index !== -1) obstacles.current.splice(index, 1);
  }, []);


  // Effects
  useEffect(() => {
    document.documentElement.requestFullscreen?.();
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
      killStreakRef.current = 0;
      setTimeout(() => {
        isPlayerDead.current = false;
        killerIdRef.current = null;
      }, RESPAWN_TIMEOUT);
    }

    // Broadcast to the whole room — only capture the killer when we're the
    // victim. killerSocketId feeds the killcam (see KillCam component).
    const handlePlayerDead = ({ killerSocketId, victimSocketId }: { killerSocketId: string; victimSocketId: string }) => {
      if (victimSocketId === socket.id) {
        killerIdRef.current = killerSocketId;
      }
    }

    const handleGameOver = () => {
      setGameOver(true);
      stopAllSounds();
      setTimeout(() => {
        socket.disconnect();
        router.push('/');
      }, 5000);
    }

    socket.on('connect', handleConnect);
    socket.on('youDied', handleYouDied);
    socket.on('playerDead', handlePlayerDead);
    socket.on('gameOver', handleGameOver);

    if (socket.connected) {
      handleConnect();
    }



    return () => {
      socket.off('connect', handleConnect);
      socket.off('youDied', handleYouDied);
      socket.off('playerDead', handlePlayerDead);
      socket.off('gameOver', handleGameOver);
      socket.off('pong-check');
    };
  }, [params.id]);

  useEffect(() => {
    const interval = setInterval(calculatePing, PING_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [calculatePing]);

  useEffect(() => {
    obstacles.current = [];
  }, []);

  // Covers leaving the game by any path other than the handleGameOver flow
  // (closing the tab, in-app route change, back button) — stops looping
  // local sounds (walk, breeze) and, critically, disconnects the socket so
  // the server's handleDisconnect fires. The socket is a singleton reused
  // across the app (see lib/socket.ts), so without this a client-side route
  // change (e.g. router.push('/')) leaves it connected — the server never
  // learns the player left, the room never gets torn down, and its bots
  // keep ticking against a "player" who's actually gone. The home page
  // already reconnects on mount if disconnected, so this is safe there.
  //
  // Debounced rather than immediate: React StrictMode (on by default in
  // `next dev`) mounts this effect, fires its cleanup, then mounts again —
  // a synthetic double-invoke to catch missing cleanup, not a real
  // navigation. An immediate disconnect() here fired on that synthetic
  // cleanup and dropped the player moments after joining. Delaying it lets
  // the guaranteed-immediate remount cancel the pending disconnect; a real
  // unmount (no remount coming) lets it fire.
  useEffect(() => {
    if (disconnectTimeoutRef.current) {
      clearTimeout(disconnectTimeoutRef.current);
      disconnectTimeoutRef.current = null;
    }

    return () => {
      stopAllSounds();
      disconnectTimeoutRef.current = setTimeout(() => {
        if (socket.connected) socket.disconnect();
      }, 100);
    };
  }, []);

  // Warns on tab close/refresh while a match is in progress. Browser-native
  // confirm dialog only — its text is ignored by modern browsers, which show
  // their own generic "leave site?" wording; the returnValue assignment is
  // what actually triggers the prompt.
  useEffect(() => {
    if (gameOver) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [gameOver]);

  // Warns on the browser back button too. Next's router navigates this away
  // client-side (no unload), so beforeunload alone never fires for it — we
  // push a guard entry onto history and intercept the resulting popstate.
  // Confirmed: pop the guard for real (skip it, then let the follow-up
  // back happen once, landing one entry before this page). Cancelled:
  // push the guard back so the user stays put.
  useEffect(() => {
    if (gameOver) return;

    window.history.pushState(null, '', window.location.href);

    const handlePopState = () => {
      const confirmed = window.confirm('Leave the match? Your progress in this round will be lost.');
      if (confirmed) {
        window.history.back();
      } else {
        window.history.pushState(null, '', window.location.href);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [gameOver]);

  useEffect(() => {
    const sound = getLoopingSound('breeze');
    sound.volume(1);
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
    removeObstacleRef,
    vegetationPositions: vegetationPositionsRef.current,
    onComponentStatusChange: handleComponentStatusChange,
    onAllComponentsLoaded: handleAllComponentsLoaded,
  }), [addObstacleRef, removeObstacleRef, handleComponentStatusChange, handleAllComponentsLoaded, vegetationPositions]);

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
      <KillFeedRenderer subscribe={(cb: (list: { id: number; name: string; streak: number }[]) => void) => listenersRef.current.push(cb)} />
      {isReady ? (
        <>
          {process.env.NODE_ENV !== 'production' && <Stats />}
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
                  alpha: true,
                  powerPreference: 'high-performance',
                  preserveDrawingBuffer: false,
                  failIfMajorPerformanceCaveat: false,
                  outputColorSpace: SRGBColorSpace,
                }}
                dpr={0.25}
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
                    smoothnessRef={smoothnessRef}
                    playerDataRef={playerDataRef}
                    showKillToast={showKillToast}
                    listenerRef={listenerRef}
                    playerCenterRef={playerCenterRef}
                  />
                  <KillCam
                    isPlayerDead={isPlayerDead}
                    killerIdRef={killerIdRef}
                    playerDataRef={playerDataRef}
                    controlsRef={controlsRef}
                  />
                  <HitImpact playerCenterRef={playerCenterRef} />
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