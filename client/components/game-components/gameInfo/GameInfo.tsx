import React, { RefObject, useEffect, useState, useRef } from 'react';
import { Heart, Target, MessageCircle, X, Skull } from 'lucide-react';
import { Vector3 } from 'three';

import socket from '@/lib/socket';
import { RadarUI } from './RadarUI';
import Scoreboard from './Scoreboard';

import { useGameInfoStore } from '@/hooks/useGameInfoStore';
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


    // ======================= handle recieve socket events ===============

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
      socket.on("gameOver", () => alert("gameover"));
      socket.on("receiveMessage", handleReceiveMessage);

      return () => {
        socket.off('receiveMessage', handleReceiveMessage);
        socket.off("hit", handleHit);
      };
    }, [socket]);

    // ====================================================================

    const healthRef = useRef(100);
    const [pingInfo, setPingInfo] = useState(0);
    const [showScoreboard, setShowScoreboard] = useState(false);
    const [showChat, setShowChat] = useState(false);
    const [chatMessage, setChatMessage] = useState('');
    const chatInputRef = useRef<HTMLInputElement>(null);
    const [hitEffects, setHitEffects] = useState<HitEffect[]>([]);
    const [damageIndicators, setDamageIndicators] = useState<DamageIndicator[]>([]);

    const ammo = useGameInfoStore((state) => state.ammo);

    const chatMessages = useRef<ChatMessage[]>([]);
    const [, forceUpdate] = useState({});

    // Calculate angle from rayOrigin to screen center (player position)
    const calculateDamageAngle = (rayOrigin: Vector3) => {
      const deltaX = -rayOrigin.x;
      const deltaZ = -rayOrigin.z;
      let angle = Math.atan2(deltaX, -deltaZ) * (180 / Math.PI);
      if (angle < 0) angle += 360;
      return angle;
    };

    // Create damage direction indicator
    const createDamageIndicator = (rayOrigin: Vector3, intensity: number = 0.8) => {
      const angle = calculateDamageAngle(rayOrigin);
      console.log(angle);

      const newIndicator: DamageIndicator = {
        id: Date.now().toString() + Math.random(),
        angle: -angle,
        intensity: Math.max(0.4, Math.min(1, intensity)),
        timestamp: Date.now(),
        duration: 1500
      };

      setDamageIndicators(prev => [...prev, newIndicator]);

      setTimeout(() => {
        setDamageIndicators(prev => prev.filter(indicator => indicator.id !== newIndicator.id));
      }, newIndicator.duration);
    };

    // Create hit effect
    const createHitEffect = (rayOrigin: Vector3) => {
      const newHitEffect: HitEffect = {
        id: Date.now().toString(),
        rayOrigin: rayOrigin,
        timestamp: Date.now(),
        duration: 1000
      };

      setHitEffects(prev => [...prev, newHitEffect]);
      createDamageIndicator(rayOrigin, 0.8);

      setTimeout(() => {
        setHitEffects(prev => prev.filter(effect => effect.id !== newHitEffect.id));
      }, newHitEffect.duration);
    };



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

    // Hit Animation Component
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

    return (
      <>
        {/* Scoreboard Component */}
        <Scoreboard
          roomId={roomId}
          currentUserId={userid}
          isVisible={showScoreboard}
          onToggle={() => setShowScoreboard(!showScoreboard)}
          onClose={() => setShowScoreboard(false)}
        />

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
          {playerDataRef && (
            <RadarUI
              myPlayerId={userid!}
              myPosition={playerCenterRef.current}
              playerDataRef={playerDataRef}
              cameraDirection={cameraDirectionRef.current}
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