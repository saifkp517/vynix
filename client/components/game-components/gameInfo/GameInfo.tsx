import React, { RefObject, useEffect, useState, useRef } from 'react';
import { Heart, Target, Users, MessageCircle, X, Skull } from 'lucide-react';
import { Vector3 } from 'three';


import socket from '@/lib/socket';
import { RadarUI } from './RadarUI'

import { useGameInfoStore } from '@/hooks/useGameInfoStore';
import { useRoomStore } from '@/hooks/useRoomStore';


interface GameInfoProps {
  roomId: string | null;
  userid: string | null;
  controlsRef?: RefObject<any>;
  grenadeCoolDownRef: RefObject<boolean>;
  bulletsAvailable: number;
  explosionTimeout: number | null;
  kills: number;
  pingRef: RefObject<number>;
  playerCenterRef: RefObject<Vector3>;
  cameraDirectionRef: RefObject<Vector3>;
  playerDataRef?: RefObject<{ [playerId: string]: { user: any; position: Vector3; velocity: Vector3, cameraDirection: Vector3 } }>;
  isPlayerDead?: RefObject<boolean>;
}

interface Player {
  id: string;
  name: string;
  kills: number;
  deaths: number;
  health: number;
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

interface DamageIndicator {
  id: string;
  angle: number;
  intensity: number;
  timestamp: number;
  duration: number;
}

const GameInfo: React.FC<GameInfoProps> = React.memo(
  ({ roomId, userid, controlsRef, bulletsAvailable, kills, pingRef, isPlayerDead, playerCenterRef, playerDataRef, cameraDirectionRef }) => {

    const healthRef = useRef(100);
    const [pingInfo, setPingInfo] = useState(0);
    const [showPlayerList, setShowPlayerList] = useState(false);
    const [showChat, setShowChat] = useState(false);
    const [chatMessage, setChatMessage] = useState('');
    const chatInputRef = useRef<HTMLInputElement>(null);
    const [hitEffects, setHitEffects] = useState<HitEffect[]>([]);
    const [damageIndicators, setDamageIndicators] = useState<DamageIndicator[]>([]);

    const ammo = useGameInfoStore((state) => state.ammo);

    // Mock data - replace with real data from your socket
    const players = useRoomStore.getState().players;
    

    const chatMessages = useRef<ChatMessage[]>([]);
    const [, forceUpdate] = useState({});

    // Calculate angle from rayOrigin to screen center (player position)
    // Fixed calculateDamageAngle function
    const calculateDamageAngle = (rayOrigin: Vector3) => {
      // The rayOrigin represents where the shot came from
      // We want to show the damage indicator pointing FROM that direction TO the player

      // Use the X and Z coordinates (horizontal plane) to determine direction
      const deltaX = -rayOrigin.x;
      const deltaZ = -rayOrigin.z;

      // Calculate angle from player position (0,0,0) to rayOrigin
      // This gives us the direction the damage came FROM
      let angle = Math.atan2(deltaX, -deltaZ) * (180 / Math.PI);

      // Convert to our UI coordinate system where:
      // 0° = North (top of screen)
      // 90° = East (right of screen)  
      // 180° = South (bottom of screen)
      // 270° = West (left of screen)

      // atan2(deltaX, deltaZ) gives us:
      // 0° when deltaX=0, deltaZ=positive (North)
      // 90° when deltaX=positive, deltaZ=0 (East)
      // This matches our desired coordinate system!

      // Normalize to 0-360 range

      // Ensure positive angle
      if (angle < 0) angle += 360;

      return angle;
    };

    // Create damage direction indicator
    const createDamageIndicator = (rayOrigin: Vector3, intensity: number = 0.8) => {
      const angle = calculateDamageAngle(rayOrigin);
      console.log(angle)

      const newIndicator: DamageIndicator = {
        id: Date.now().toString() + Math.random(),
        angle: -angle,
        intensity: Math.max(0.4, Math.min(1, intensity)),
        timestamp: Date.now(),
        duration: 1500 // 1.5 seconds
      };

      setDamageIndicators(prev => [...prev, newIndicator]);

      // Remove indicator after duration
      setTimeout(() => {
        setDamageIndicators(prev => prev.filter(indicator => indicator.id !== newIndicator.id));
      }, newIndicator.duration);
    };

    // Create hit effect (simplified without impact point)
    const createHitEffect = (rayOrigin: Vector3) => {
      const newHitEffect: HitEffect = {
        id: Date.now().toString(),
        rayOrigin: rayOrigin,
        timestamp: Date.now(),
        duration: 1000
      };

      setHitEffects(prev => [...prev, newHitEffect]);

      // Create damage indicator when hit
      createDamageIndicator(rayOrigin, 0.8);

      // Remove effect after duration
      setTimeout(() => {
        setHitEffects(prev => prev.filter(effect => effect.id !== newHitEffect.id));
      }, newHitEffect.duration);
    };

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
        healthRef.current -= 10;
        createHitEffect(rayOrigin);
      };

      socket.on("hit", handleHit);
      socket.on("gameOver", () => alert("gameover"))
      socket.on("receiveMessage", handleReceiveMessage);

      return () => {
        socket.off('receiveMessage', handleReceiveMessage);
        socket.off("hit", handleHit);
      };
    }, []);

    useEffect(() => {
      const interval = setInterval(() => {
        setPingInfo(pingRef.current || 0);
      }, 1000);

      return () => clearInterval(interval);
    }, []);

    // Helper function to unlock controls (disable pointer lock)
    const unlockControls = () => {
      if (controlsRef?.current && controlsRef.current.isLocked) {
        controlsRef.current.isLocked = true;
      }
    };

    // Helper function to lock controls (enable pointer lock)
    const lockControls = () => {
      if (controlsRef?.current && !controlsRef.current.isLocked && !showChat && !showPlayerList) {
        controlsRef.current.isLocked = false;
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
          } else if (showPlayerList) {
            setShowPlayerList(false);
            setTimeout(lockControls, 50);
          }
        }
        else if (event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          if (!showPlayerList) {
            unlockControls();
          }
          setShowPlayerList((prev) => {
            const newValue = !prev;
            if (!newValue) {
              setTimeout(lockControls, 50);
            }
            return newValue;
          });
        }
        else if (event.key === 'Enter' && showChat) {
          event.preventDefault();
          event.stopPropagation();
          handleSendMessage();
          unlockControls();
          return;
        }

        if (showChat || showPlayerList) {
          event.stopPropagation();
        }
      };

      document.addEventListener('keydown', handleKeyDown, { capture: true });

      return () => {
        document.removeEventListener('keydown', handleKeyDown, { capture: true });
      };
    }, [showChat, showPlayerList, chatMessage, handleSendMessage]);

    const handleChatClose = () => {
      setShowChat(false);
      setChatMessage('');
      setTimeout(lockControls, 50);
    };

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

    // Damage Direction Arc Component
    const DamageArc = ({ indicator }: { indicator: DamageIndicator }) => {
      const elapsed = Date.now() - indicator.timestamp;
      const progress = Math.min(elapsed / indicator.duration, 1);

      const opacity = Math.max(0, 1 - progress) * indicator.intensity;
      const pulseScale = 1 + (Math.sin(elapsed / 150) * 0.15 * (1 - progress));

      const rotation = indicator.angle;
      const arcLength = 45;
      const radius = 100;
      const thickness = 3;

      const startAngle = -arcLength / 2;
      const endAngle = arcLength / 2;
      const startAngleRad = (startAngle * Math.PI) / 180;
      const endAngleRad = (endAngle * Math.PI) / 180;

      const innerRadius = radius - thickness / 2;
      const outerRadius = radius + thickness / 2;

      const x1 = Math.sin(startAngleRad) * innerRadius;
      const y1 = -Math.cos(startAngleRad) * innerRadius;
      const x2 = Math.sin(startAngleRad) * outerRadius;
      const y2 = -Math.cos(startAngleRad) * outerRadius;
      const x3 = Math.sin(endAngleRad) * outerRadius;
      const y3 = -Math.cos(endAngleRad) * outerRadius;
      const x4 = Math.sin(endAngleRad) * innerRadius;
      const y4 = -Math.cos(endAngleRad) * innerRadius;

      const pathData = `
        M ${x1} ${y1}
        L ${x2} ${y2}
        A ${outerRadius} ${outerRadius} 0 0 1 ${x3} ${y3}
        L ${x4} ${y4}
        A ${innerRadius} ${innerRadius} 0 0 0 ${x1} ${y1}
        Z
      `;

      return (
        <div
          className="absolute inset-0 pointer-events-none flex items-center justify-center"
          style={{
            transform: `rotate(${rotation}deg) scale(${pulseScale})`,
            opacity: opacity
          }}
        >
          <svg
            width="250"
            height="250"
            viewBox="-125 -125 250 250"
            className="absolute"
          >
            <defs>
              <radialGradient id={`damageGradient-${indicator.id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(255, 50, 50, 0.9)" />
                <stop offset="70%" stopColor="rgba(255, 100, 100, 0.6)" />
                <stop offset="100%" stopColor="rgba(255, 0, 0, 0.2)" />
              </radialGradient>
              <filter id={`glow-${indicator.id}`}>
                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <path
              d={pathData}
              fill={`url(#damageGradient-${indicator.id})`}
              filter={`url(#glow-${indicator.id})`}
            />

            <polygon
              points={`0,-${radius + 12} -6,-${radius + 4} 6,-${radius + 4}`}
              fill="rgba(255, 255, 255, 0.8)"
              filter={`url(#glow-${indicator.id})`}
            />
          </svg>
        </div>
      );
    };

    // Simplified Hit Animation Component (damage flash overlay)
    const HitAnimation = ({ effect }: { effect: HitEffect }) => {
      const elapsed = Date.now() - effect.timestamp;
      const progress = Math.min(elapsed / effect.duration, 1);

      // Create a red damage flash that fades out
      const flashOpacity = Math.max(0, 1 - (elapsed / 300)); // Quick 300ms flash
      const pulseIntensity = Math.max(0, 1 - (elapsed / 500)); // Pulse effect

      return (
        <>
          {/* Screen flash overlay */}
          {flashOpacity > 0 && (
            <div
              className="fixed inset-0 pointer-events-none z-45"
              style={{
                background: `radial-gradient(circle at center, rgba(255, 0, 0, ${flashOpacity * 0.3}) 0%, rgba(255, 0, 0, ${flashOpacity * 0.1}) 50%, transparent 100%)`,
              }}
            />
          )}

          {/* Edge vignette effect */}
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

    return (
      <>
        {/* <Stats /> */}

        {/* Damage Direction Indicators */}
        <div className="fixed inset-0 pointer-events-none z-35">
          {/* {damageIndicators.map(indicator => (
            <DamageArc key={indicator.id} indicator={indicator} />
          ))} */}
        </div>

        {/* Hit Effects Overlay */}
        {hitEffects.map(effect => (
          <HitAnimation key={effect.id} effect={effect} />
        ))}

        {/* Health Text - Top Left */}
        <div className="fixed top-14 left-2 z-30">
          <div className="flex items-center space-x-2 text-white/90">
            <Heart size={14} className="text-red-400" />
            <span className="text-sm font-medium tabular-nums">{healthRef.current}</span>
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
        <div className="fixed top-2 left-1/2 transform -translate-x-1/2 z-30">
          <div className="flex items-center space-x-2 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1">
            <Skull size={14} className="text-yellow-400" />
            <span className="text-sm font-medium text-white/90 tabular-nums">{kills}</span>
          </div>
        </div>

        {/* Network Status - Top Right */}
        <div className="fixed top-2 right-2 z-30">
          <RadarUI myPlayerId={userid!} myPosition={playerCenterRef.current} playerDataRef={playerDataRef} cameraDirection={cameraDirectionRef.current} />
          <div className="flex items-center space-x-2 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1">
            <div className="flex items-end space-x-0.5">
              {getPingBars(pingInfo)}
            </div>
            <span className={`text-xs font-medium tabular-nums ${getPingColor(pingInfo)}`}>
              {pingInfo}
            </span>
          </div>
        </div>

        {/* Persistent Chat Log - Bottom Left (Translucent) */}
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

        {/* Player List Toggle - Left Side */}
        <div className="fixed left-0 top-1/2 transform -translate-y-1/2 z-30">
          <button
            onClick={() => {
              if (!showPlayerList) {
                unlockControls();
              }
              setShowPlayerList(!showPlayerList);
              if (showPlayerList) {
                setTimeout(lockControls, 50);
              }
            }}
            className="bg-black/30 backdrop-blur-sm p-2 rounded-r-lg border-r border-white/10 hover:bg-black/50 transition-colors"
          >
            <Users size={16} className="text-white/70" />
          </button>
        </div>

        {/* Chat Indicator - Bottom Right (above ammo) */}
        <div className="fixed bottom-16 right-2 z-30">
          <div className="text-xs text-white/40 text-center">
            <MessageCircle size={12} className="mx-auto mb-1" />
            <div>C</div>
          </div>
        </div>

        {/* Player List Panel */}
        {showPlayerList && (
          <div className="fixed left-0 top-0 h-full w-44 bg-black/50 backdrop-blur-sm border-r border-black/10 z-40">
            <div className="p-1">
              <div className="flex justify-between items-center mb-1">
                <span className="text-gray-300 text-xs font-medium">{players.length}</span>
                <button
                  onClick={() => {
                    setShowPlayerList(false);
                    setTimeout(lockControls, 50);
                  }}
                  className="text-gray-500 hover:text-gray-300"
                >
                  <X size={10} />
                </button>
              </div>

              <div className="space-y-0.5">
                {players.map((player) => (
                  <div key={player.id} className="bg-black/20 rounded p-1">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1">
                        <div className={`w-0.5 h-0.5 rounded-full ${player.health > 0 ? 'bg-green-400' : 'bg-red-400'}`} />
                        <span className="text-gray-300 text-xs truncate max-w-[80px]">{player.username}</span>
                        {player.id === userid && (
                          <span className="text-[10px] bg-black/30 text-gray-300 px-0.5 rounded">You</span>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
                      <span>{player.kills}/{player.deaths}</span>
                      <span>{player.health}%</span>
                    </div>

                    {player.health > 0 && (
                      <div className="mt-0.5 w-full bg-black/30 rounded-full h-0.5">
                        <div
                          className="bg-green-400 h-0.5 rounded-full"
                          style={{ width: `${player.health}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Minimalist Chat Panel */}
        {showChat && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 w-96 z-40">
            <div className="mb-2 space-y-1 max-h-32 overflow-y-auto">
              {chatMessages.current.slice(-4).map((msg) => (
                <div key={msg.id} className="bg-black/60 backdrop-blur-sm rounded px-2 py-1 text-xs">
                  <span className={`font-medium`}>
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
                onChange={(e) => {
                  setChatMessage(e.target.value);
                }}
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

        {/* Death Screen */}
        {isPlayerDead?.current && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="text-center">
              <div className="w-6 h-6 border-2 border-red-400/30 border-t-red-500 rounded-full animate-spin mx-auto mb-3" />
              <h1 className="text-white text-xl font-light">Eliminated</h1>
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