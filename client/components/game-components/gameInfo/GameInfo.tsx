import React, { RefObject, useEffect, useState, useRef } from 'react';
import { Heart, Target, MessageCircle, X, Skull } from 'lucide-react';
import { Vector3 } from 'three';

import socket from '@/lib/socket';
import { RadarUI } from './RadarUI';
import Scoreboard from './Scoreboard';
import { Crosshair } from '../crosshair/CrossHair';

import { useGameInfoStore } from '@/hooks/useGameInfoStore';;

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

      const handleHit = ({ rayOrigin }: { rayOrigin: Vector3 }) => {
        healthRef.current = Math.max(0, healthRef.current - 10);
        setHealthInfo(healthRef.current);
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

    useEffect(() => {
      const interval = setInterval(() => setNow(Date.now()), 100);
      return () => clearInterval(interval);
    }, []);

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
    const scopeLevel = useGameInfoStore((state) => state.scopeLevel);

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

          {/* Invincibility ability — Q to activate */}
          <div className="flex items-center space-x-2 mt-2">
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
        </div>

        {/* Ammo - Bottom Right Corner */}
        <div className="fixed bottom-0 right-0 p-3 z-30">
          <div className="text-right text-white/90">
            <div className="flex items-center justify-end space-x-2 mb-1">
              <Target size={14} className="text-orange-400" />
              <span className="text-lg font-bold tabular-nums">{ammo}</span>
              <span className="text-sm text-white/60">/</span>
              <span className="text-sm text-white/60 tabular-nums">{bulletsAvailable}</span>
            </div>
          </div>
        </div>

        {/* Kills Counter - Top Center */}
        {/* <div className="fixed top-2 left-1/2 transform -translate-x-1/2 z-30">
          <div className="flex items-center space-x-2 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1">
            <Skull size={14} className="text-yellow-400" />
            <span className="text-sm font-medium text-white/90 tabular-nums">{kills}</span>
          </div>
        </div> */}

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

        {/* Chat Indicator - Bottom Right */}
        <div className="fixed bottom-16 right-2 z-30">
          <div className="text-xs text-white/40 text-center">
            <MessageCircle size={12} className="mx-auto mb-1" />
            <div>C</div>
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

        {/* Sniper scope overlay */}
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
                <mask id="scope-aperture-mask">
                  <rect x="0" y="0" width="100" height="100" fill="white" />
                  <circle cx="50" cy="50" r="34" fill="black" />
                </mask>
              </defs>
              <rect
                x="0"
                y="0"
                width="100"
                height="100"
                fill="black"
                mask="url(#scope-aperture-mask)"
              />
              <circle cx="50" cy="50" r="34" fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="0.6" />
              <line x1="50" y1="16" x2="50" y2="84" stroke="rgba(0,0,0,0.55)" strokeWidth="0.25" />
              <line x1="16" y1="50" x2="84" y2="50" stroke="rgba(0,0,0,0.55)" strokeWidth="0.25" />
              {[-24, -16, -8, 8, 16, 24].map((offset) => (
                <line
                  key={`tick-h-${offset}`}
                  x1={50 + offset}
                  y1="48.5"
                  x2={50 + offset}
                  y2="51.5"
                  stroke="rgba(0,0,0,0.55)"
                  strokeWidth="0.25"
                />
              ))}
              {[-24, -16, -8, 8, 16, 24].map((offset) => (
                <line
                  key={`tick-v-${offset}`}
                  x1="48.5"
                  y1={50 + offset}
                  x2="51.5"
                  y2={50 + offset}
                  stroke="rgba(0,0,0,0.55)"
                  strokeWidth="0.25"
                />
              ))}
              <circle cx="50" cy="50" r="0.6" fill="rgba(0,0,0,0.7)" />
            </svg>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/70 text-xs font-bold tracking-wide">
              {scopeLevel}x
            </div>
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