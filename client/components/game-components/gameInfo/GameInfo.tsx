import React, { RefObject, useEffect, useState, useRef } from 'react';
import { Heart, Target, MessageCircle, X, Skull } from 'lucide-react';
import { Vector3 } from 'three';

import socket from '@/lib/socket';
import { RadarUI } from './RadarUI';
import Scoreboard from './Scoreboard';
import { Crosshair } from '../crosshair/CrossHair';

import { useGameInfoStore } from '@/hooks/useGameInfoStore';;
import { useRoomStore } from '@/hooks/useRoomStore';

interface Player {
  socketId: string;
  userId: string;
  room: string;
  username: string;
  position: Vector3;
  velocity: Vector3;
  health: number;
  isDead: boolean;
  kills: number;
  deaths: number;
  cameraDirection: Vector3
}

interface GameInfoProps {
  roomId: string | null;
  userid: string | null;
  controlsRef?: RefObject<any>;
  crosshairRef: RefObject<any>;
  grenadeCoolDownRef: RefObject<boolean>;
  bulletsAvailable: number;
  explosionTimeout: number | null;
  kills: number;
  pingRef: RefObject<number>;
  playerCenterRef: RefObject<Vector3>;
  cameraDirectionRef: RefObject<Vector3>;
  playerDataRef?: RefObject<{ [playerId: string]: { user: any; position: Vector3; velocity: Vector3, cameraDirection: Vector3 } }>;
  isPlayerDead?: RefObject<boolean>;
  gameOver: boolean;
}

interface ChatMessage {
  id: string;
  playerName: string;
  message: string;
  timestamp: Date;
}


interface HitEffect {
  id: string;
  rayOrigin: Vector3;
  timestamp: number;
  duration: number;
}

const LOW_HEALTH_THRESHOLD = 80;

const GameInfo: React.FC<GameInfoProps> = React.memo(
  ({ roomId, userid, controlsRef, crosshairRef, bulletsAvailable, kills, pingRef, isPlayerDead, playerCenterRef, playerDataRef, cameraDirectionRef, gameOver }) => {

    //* ======================= handle recieve socket events ===============

    // ! the socket events called here can be unmounted, so make sure that the events called are only those that effect the ongoing gameplay
    useEffect(() => {

      const handleReceiveMessage = ({ userId, message }: { userId: string, message: string }) => {
        console.log('Received message:', userId, message);
        chatMessages.current.push({
          id: `${userId}-${Date.now()}`,
          playerName: userId,
          message,
          timestamp: new Date(),
        });
        forceUpdate({});
      };

      const handleHit = ({ rayOrigin, health }: { rayOrigin: Vector3; health: number }) => {
        // Trust the server's post-hit health instead of guessing locally —
        // a locally-decremented value never resyncs with Redis truth if a
        // 'hit' event is ever dropped or reordered.
        healthRef.current = health;
        setHealthInfo(health);
        createHitEffect(rayOrigin);
      };

      const handlePlayerRespawned = ({ id }: { id: string }) => {
        if (id === userid) {
          healthRef.current = 100;
          setHealthInfo(100);
          setKillerName(null);
        }
      };

      const handlePlayerDead = ({
        victimSocketId,
        killerName: killedBy,
      }: {
        victimSocketId: string;
        killerName: string;
      }) => {
        if (victimSocketId === userid) {
          setKillerName(killedBy);
        }
      };

      const handleHealthRegen = ({ id, health }: { id: string; health: number }) => {
        if (id === userid) {
          healthRef.current = health;
          setHealthInfo(health);
        }
      };

      const handleAbilityActivated = ({
        id,
        invincibleUntil,
        abilityCooldownUntil,
      }: {
        id: string;
        invincibleUntil: number;
        abilityCooldownUntil: number;
      }) => {
        if (id === userid) {
          setAbilityState({ invincibleUntil, cooldownUntil: abilityCooldownUntil });
        }
      };

      socket.on("hit", handleHit);
      socket.on("receiveMessage", handleReceiveMessage);
      socket.on("playerRespawned", handlePlayerRespawned);
      socket.on("healthRegen", handleHealthRegen);
      socket.on("abilityActivated", handleAbilityActivated);
      socket.on("playerDead", handlePlayerDead);

      return () => {
        socket.off('receiveMessage', handleReceiveMessage);
        socket.off("hit", handleHit);
        socket.off("playerRespawned", handlePlayerRespawned);
        socket.off("healthRegen", handleHealthRegen);
        socket.off("abilityActivated", handleAbilityActivated);
        socket.off("playerDead", handlePlayerDead);
      };
    }, [socket, userid]);

    // ====================================================================

    const healthRef = useRef(100);
    const [healthInfo, setHealthInfo] = useState(100);
    const [killerName, setKillerName] = useState<string | null>(null);
    const [pingInfo, setPingInfo] = useState(0);
    const [showScoreboard, setShowScoreboard] = useState(false);
    const [showChat, setShowChat] = useState(false);
    const [chatMessage, setChatMessage] = useState('');
    const chatInputRef = useRef<HTMLInputElement>(null);
    const [hitEffects, setHitEffects] = useState<HitEffect[]>([]);

    // Create hit effect — brief red screen flash/pulse in the direction-agnostic
    // center, distinct from the low-health vignette which is persistent.
    const createHitEffect = (rayOrigin: Vector3) => {
      const newHitEffect: HitEffect = {
        id: Date.now().toString() + Math.random(),
        rayOrigin,
        timestamp: Date.now(),
        duration: 1000,
      };

      setHitEffects(prev => [...prev, newHitEffect]);

      setTimeout(() => {
        setHitEffects(prev => prev.filter(effect => effect.id !== newHitEffect.id));
      }, newHitEffect.duration);
    };

    // Invincibility ability — timestamps come from the server (activateInvincibility
    // in CombatService), so cooldown can't be spoofed by editing local state.
    const [abilityState, setAbilityState] = useState({ invincibleUntil: 0, cooldownUntil: 0 });
    const [now, setNow] = useState(Date.now());
    // Server sends startTime/duration once on 'gameStarted', caught by
    // useSocketHandlersMain on the lobby page (before this component mounts)
    // and stashed in useRoomStore; remaining time is computed locally every
    // tick instead of the server pushing a countdown.
    const matchTiming = useRoomStore((state) => state.matchTiming);

    useEffect(() => {
      const interval = setInterval(() => setNow(Date.now()), 100);
      return () => clearInterval(interval);
    }, []);

    const matchTimeRemainingMs = matchTiming
      ? Math.max(0, matchTiming.startTime + matchTiming.duration - now)
      : null;

    const isInvincible = now < abilityState.invincibleUntil;
    const abilityCooldownRemainingMs = Math.max(0, abilityState.cooldownUntil - now);
    const abilityReady = abilityCooldownRemainingMs <= 0;

    useEffect(() => {
      const handleAbilityKeyDown = (event: KeyboardEvent) => {
        if (event.key.toLowerCase() === 'q' && !showChat) {
          socket.emit("useAbility", { roomId });
        }
      };
      window.addEventListener('keydown', handleAbilityKeyDown);
      return () => window.removeEventListener('keydown', handleAbilityKeyDown);
    }, [roomId, showChat]);

    const ammo = useGameInfoStore((state) => state.ammo);
    const isScoped = useGameInfoStore((state) => state.isScoped);

    const chatMessages = useRef<ChatMessage[]>([]);
    const [, forceUpdate] = useState({});

    useEffect(() => {
      const interval = setInterval(() => {
        setPingInfo(pingRef.current || 0);
      }, 1000);

      return () => clearInterval(interval);
    }, []);

    // Helper function to unlock controls
    const unlockControls = () => {
      console.log("lock controls called")
      if (controlsRef?.current && controlsRef.current.isLocked) {
        controlsRef.current.isLocked = false;
      }
    };

    // Helper function to lock controls
    const lockControls = () => {
      console.log("lock controls called")
      if (controlsRef?.current && !controlsRef.current.isLocked && !showChat && !showScoreboard) {
        controlsRef.current.isLocked = true;
      }
    };

    const handleSendMessage = () => {
      if (chatMessage.trim()) {
        console.log(roomId, userid, chatMessage.trim());
        socket.emit("sendMessage", { roomId, userId: userid, message: chatMessage.trim() });
        setChatMessage('');
        setShowChat(false);
        setTimeout(lockControls, 50);
      }
    };

    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key.toLowerCase() === 'c' && !showChat) {
          event.preventDefault();
          event.stopPropagation();
          unlockControls();
          setShowChat(true);
          setChatMessage('');
          setTimeout(() => {
            chatInputRef.current?.focus();
          }, 100);
        }
        else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (showChat) {
            setShowChat(false);
            setChatMessage('');
            setTimeout(lockControls, 50);
          } else if (showScoreboard) {
            setShowScoreboard(false);
            setTimeout(lockControls, 50);
          }
        }
        else if (event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          setShowScoreboard((prev) => {
            return !prev;
          });
        }
        else if (event.key === 'Enter' && showChat) {
          event.preventDefault();
          event.stopPropagation();
          handleSendMessage();
          unlockControls();
          return;
        }

        if (showChat) {
          event.stopPropagation();
        }
      };

      document.addEventListener('keydown', handleKeyDown, { capture: true });

      return () => {
        document.removeEventListener('keydown', handleKeyDown, { capture: true });
      };
    }, [showChat, showScoreboard, chatMessage, handleSendMessage]);

    const getPingColor = (ping: number) => {
      if (ping < 50) return 'text-emerald-400';
      if (ping < 100) return 'text-yellow-400';
      return 'text-red-400';
    };

    const getPingBars = (ping: number) => {
      const bars = [];
      const levels = [25, 50, 75, 100];

      for (let i = 0; i < 4; i++) {
        const isActive = ping > levels[i];
        const height = `h-${i + 2}`;
        const color = ping < 50 ? 'bg-emerald-400' : ping < 100 ? 'bg-yellow-400' : 'bg-red-400';

        bars.push(
          <div
            key={i}
            className={`w-0.5 ${height} rounded-full transition-colors ${isActive ? color : 'bg-gray-600'}`}
          />
        );
      }
      return bars;
    };

    const getRecentMessages = () => {
      return chatMessages.current.slice(-2);
    };

    const getHealthColor = (health: number) => {
      if (health > 60) return 'text-emerald-400';
      if (health > 30) return 'text-yellow-400';
      return 'text-red-400';
    };

    const getHealthBarColor = (health: number) => {
      if (health > 60) return 'bg-emerald-400';
      if (health > 30) return 'bg-yellow-400';
      return 'bg-red-400';
    };

    // Hit Animation Component — brief flash + pulse on taking damage
    const HitAnimation = ({ effect }: { effect: HitEffect }) => {
      const elapsed = Date.now() - effect.timestamp;
      const flashOpacity = Math.max(0, 1 - (elapsed / 300));
      const pulseIntensity = Math.max(0, 1 - (elapsed / 500));

      return (
        <>
          {flashOpacity > 0 && (
            <div
              className="fixed inset-0 pointer-events-none z-45"
              style={{
                background: `radial-gradient(circle at center, rgba(255, 0, 0, ${flashOpacity * 0.3}) 0%, rgba(255, 0, 0, ${flashOpacity * 0.1}) 50%, transparent 100%)`,
              }}
            />
          )}

          {pulseIntensity > 0 && (
            <div
              className="fixed inset-0 pointer-events-none z-44"
              style={{
                background: `radial-gradient(ellipse at center, transparent 60%, rgba(255, 0, 0, ${pulseIntensity * 0.2}) 100%)`,
              }}
            />
          )}
        </>
      );
    };

    // Low-health vignette — a persistent (not fading) red glow around the
    // screen edges standing in for "bloody vision" the lower your health
    // gets. Center stays clear (that's where you're actually aiming), so
    // the gradient is inverted from the old hit-flash: transparent middle,
    // red edges. Opacity ramps linearly from 0 at LOW_HEALTH_THRESHOLD down
    // to fully opaque at 0hp, instead of snapping on/off.
    const lowHealthOpacity = Math.max(
      0,
      Math.min(1, (LOW_HEALTH_THRESHOLD - healthInfo) / LOW_HEALTH_THRESHOLD),
    );

    return (
      <>
        {lowHealthOpacity > 0 && (
          <div
            className="fixed inset-0 pointer-events-none z-45 transition-opacity duration-300"
            style={{
              background: `radial-gradient(ellipse at center, transparent 40%, rgba(255, 0, 0, 0.85) 100%)`,
              opacity: lowHealthOpacity,
            }}
          />
        )}

        {/* Invincibility shield — cyan edge glow, mirrors the low-health vignette
            so it reads instantly as "protected" rather than competing with it. */}
        {isInvincible && (
          <div
            className="fixed inset-0 pointer-events-none z-46"
            style={{
              background: `radial-gradient(ellipse at center, transparent 55%, rgba(56, 189, 248, 0.55) 100%)`,
            }}
          />
        )}

        {/* Hit Effects Overlay */}
        {hitEffects.map(effect => (
          <HitAnimation key={effect.id} effect={effect} />
        ))}

        {/* Scoreboard Component */}
        <Scoreboard
          roomId={roomId}
          currentUserId={userid}
          isVisible={showScoreboard}
          onToggle={() => setShowScoreboard(!showScoreboard)}
          onClose={() => setShowScoreboard(false)}
        />

        {/* Health - Top Left Corner */}
        <div className="fixed top-2 left-2 p-3 z-30">
          <div className="text-white/90">
            <div className="flex items-center space-x-2 mb-1">
              <Heart size={14} className={getHealthColor(healthInfo)} />
              <span className="text-lg font-bold tabular-nums">{healthInfo}</span>
            </div>
            <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${getHealthBarColor(healthInfo)}`}
                style={{ width: `${Math.max(0, Math.min(100, healthInfo))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Match Timer - Top Center */}
        {matchTimeRemainingMs !== null && (
          <div className="fixed top-2 left-1/2 transform -translate-x-1/2 z-30">
            <div className="bg-black/30 backdrop-blur-sm rounded-full px-3 py-1">
              <span className="text-sm font-medium text-white/90 tabular-nums">
                {String(Math.floor(matchTimeRemainingMs / 60000)).padStart(2, '0')}:
                {String(Math.floor((matchTimeRemainingMs % 60000) / 1000)).padStart(2, '0')}
              </span>
            </div>
          </div>
        )}

        {/* Network Status - Top Right */}
        <div className="fixed top-2 right-2 z-30">
          {playerDataRef && (
            <RadarUI
              myPlayerId={userid!}
              myPositionRef={playerCenterRef}
              playerDataRef={playerDataRef}
              cameraDirectionRef={cameraDirectionRef}
            />
          )}
          <div className="flex items-center space-x-2 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1">
            <div className="flex items-end space-x-0.5">
              {getPingBars(pingInfo)}
            </div>
            <span className={`text-xs font-medium tabular-nums ${getPingColor(pingInfo)}`}>
              {pingInfo}
            </span>
          </div>
        </div>

        {/* Persistent Chat Log - Bottom Left */}
        {!showChat && getRecentMessages().length > 0 && (
          <div className="fixed bottom-20 left-4 z-20 pointer-events-none">
            <div className="space-y-1 max-w-xs">
              {getRecentMessages().map((msg) => (
                <div key={msg.id} className="bg-black/20 backdrop-blur-sm rounded px-2 py-1 text-xs transition-opacity duration-300">
                  <span className="font-medium text-white/70">
                    {msg.playerName}:
                  </span>
                  <span className="text-white/60 ml-1">{msg.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Center Bar - Ammo, Invincibility Ability, Chat */}
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-30">
          <div className="flex items-center space-x-3 bg-black/30 backdrop-blur-sm rounded-full px-4 py-1.5">
            <div className="flex items-center space-x-2">
              <Target size={14} className="text-orange-400" />
              <span className="text-sm font-bold text-white/90 tabular-nums">{ammo}</span>
              <span className="text-xs text-white/50">/</span>
              <span className="text-xs text-white/50 tabular-nums">{bulletsAvailable}</span>
            </div>

            <div className="w-px h-4 bg-white/15" />

            <div className="flex items-center space-x-1.5">
              <div
                className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center text-[9px] font-bold ${
                  isInvincible
                    ? 'border-sky-400 bg-sky-400/30 text-sky-200'
                    : abilityReady
                      ? 'border-white/60 text-white/80'
                      : 'border-white/20 text-white/30'
                }`}
              >
                Q
              </div>
              <span className="text-xs text-white/50">activate invincibility</span>
              <span
                className={`text-xs font-bold tabular-nums ${
                  isInvincible ? 'text-sky-300' : abilityReady ? 'text-white/80' : 'text-white/40'
                }`}
              >
                {isInvincible
                  ? `${Math.ceil((abilityState.invincibleUntil - now) / 1000)}s`
                  : abilityReady
                    ? 'READY'
                    : `${Math.ceil(abilityCooldownRemainingMs / 1000)}s`}
              </span>
            </div>

            <div className="w-px h-4 bg-white/15" />

            <div className="flex items-center space-x-1 text-white/40">
              <MessageCircle size={12} />
              <span className="text-xs">C</span>
            </div>
          </div>
        </div>

        {/* Chat Panel */}
        {showChat && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 w-96 z-40">
            <div className="mb-2 space-y-1 max-h-32 overflow-y-auto">
              {chatMessages.current.slice(-4).map((msg) => (
                <div key={msg.id} className="bg-black/60 backdrop-blur-sm rounded px-2 py-1 text-xs">
                  <span className="font-medium">
                    {msg.playerName}:
                  </span>
                  <span className="text-white/80 ml-1">{msg.message}</span>
                </div>
              ))}
            </div>

            <div className="bg-black/80 backdrop-blur-sm rounded-lg p-2 border border-white/20">
              <input
                ref={chatInputRef}
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                onFocus={() => {
                  console.log('Input focused');
                  unlockControls();
                }}
                onBlur={() => console.log('Input blurred')}
                placeholder="Say something..."
                className="w-full bg-transparent text-white text-sm placeholder-white/50 focus:outline-none"
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Death Screen — a corner toast, not a full-screen block, so the
            killcam (spectating whoever killed you) stays visible behind it */}
        {isPlayerDead?.current && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
            <div className="bg-black/60 backdrop-blur-sm rounded-lg px-5 py-2.5 border border-red-500/30 flex items-center gap-2.5">
              <div className="w-3.5 h-3.5 border-2 border-red-400/30 border-t-red-500 rounded-full animate-spin" />
              <h1 className="text-white text-sm font-light tracking-wide">
                Eliminated{killerName ? <span className="text-white/60"> by {killerName}</span> : null}
              </h1>
            </div>
          </div>
        )}

        {/* Game Over */}
        {gameOver && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="text-center">
              {/* <div className="w-6 h-6 border-2 border-red-400/30 border-t-red-500 rounded-full animate-spin mx-auto mb-3" /> */}
              <h1 className="text-white text-xl font-light">Game Over</h1>
            </div>
          </div>
        )}

        {/* Crosshair — stays mounted (so youHit still reaches it) but visually
            hidden behind the scope overlay while scoped in */}
        {
          !gameOver && !isPlayerDead?.current && (
            <Crosshair ref={crosshairRef} hidden={isScoped} />
          )
        }

        {/* Laser sight overlay — tiny glowing red dot inside a wide gun-mounted
            reflex sight housing. viewBox is 100x100 with "slice" scaling, so
            the visible area only spans out to r=50 on the shorter screen
            axis — the housing has to live inside that or it renders
            off-screen (which is what a much larger radius here did before). */}
        {isScoped && !gameOver && !isPlayerDead?.current && (
          <div className="fixed inset-0 z-40 pointer-events-none">
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid slice"
              className="absolute inset-0"
            >
              <defs>
                <filter id="dotGlow" x="-400%" y="-400%" width="900%" height="900%">
                  <feGaussianBlur stdDeviation="0.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <radialGradient id="housingBevel" cx="50%" cy="50%" r="50%">
                <stop offset="62%" stopColor="rgba(0,0,0,0)" />
                <stop offset="80%" stopColor="rgba(15,15,15,0.65)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.95)" />
              </radialGradient>
              <linearGradient id="housingRim" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#3a3a3a" />
                <stop offset="50%" stopColor="#111" />
                <stop offset="100%" stopColor="#050505" />
              </linearGradient>

              {/* Housing tube — darkens off well outside the reticle so it
                  frames the edges of the view without ever touching the
                  aiming area around the dot. */}
              <circle cx="50" cy="50" r="50" fill="url(#housingBevel)" />

              {/* Outer rim of the sight tube */}
              <circle cx="50" cy="50" r="46" fill="none" stroke="url(#housingRim)" strokeWidth="5" />
              <circle cx="50" cy="50" r="43" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.4" />

              {/* Two mounting posts top/bottom, thin enough to stay clear of
                  the reticle and any reasonable aim adjustment */}
              <rect x="48.5" y="0" width="3" height="8" fill="url(#housingRim)" />
              <rect x="48.5" y="92" width="3" height="8" fill="url(#housingRim)" />
              <circle cx="50" cy="3" r="1" fill="#4a4a4a" />
              <circle cx="50" cy="97" r="1" fill="#4a4a4a" />

              {/* Reticle */}
              <circle cx="50" cy="50" r="1.4" fill="none" stroke="rgba(255,32,32,0.4)" strokeWidth="0.12" />
              <g filter="url(#dotGlow)">
                <circle cx="50" cy="50" r="0.22" fill="#ff2020" />
              </g>
            </svg>
          </div>
        )}


        {/* Room Info - Subtle Bottom Left */}
        <div className="fixed bottom-2 left-2 z-30">
          <div className="text-xs text-white/40 space-y-0.5">
            <div>Room: {roomId || 'N/A'}</div>
            <div>ID: {userid || 'N/A'}</div>
          </div>
        </div>
      </>
    );
  }
);

export default GameInfo;