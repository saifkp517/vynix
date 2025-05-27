import React, { RefObject, useEffect, useState } from 'react';
import socket from '@/lib/socket';
import { Heart, Crosshair, Target, Users } from 'lucide-react';

interface GameInfoProps {
  roomId: string | null;
  userid: string | null;
  team: string | null;
  grenadeCoolDownRef: RefObject<boolean>;
  ammoRef: RefObject<number>;
  bulletsAvailable: number;
  explosionTimeout: number | null; // Seconds until explosion (e.g., grenade)
  health: number; // Player health (0-100)
  kills: number;
  pingRef: RefObject<number>;
  isPlayerDead?: RefObject<boolean>; // Optional prop to indicate if the player is dead
}

// Reusable HUD Box component
interface HudBoxProps {
  children: React.ReactNode;
  position: string;
  className?: string;
}

const HudBox: React.FC<HudBoxProps> = ({ children, position, className = "" }) => (
  <div className={`fixed ${position} bg-gray-900/40 text-white p-3 rounded-lg shadow-lg border border-gray-700/40 backdrop-blur-sm z-20 ${className}`}>
    {children}
  </div>
);

const GameInfo: React.FC<GameInfoProps> = React.memo(
  ({ roomId, userid, team, ammoRef, bulletsAvailable, health, kills, pingRef, grenadeCoolDownRef, isPlayerDead }) => {



    const [pingInfo, setPingInfo] = useState(0);
    const [showCooldown, setShowCooldown] = useState(false);
    const [cooldownTimeLeft, setCooldownTimeLeft] = useState(0);

    useEffect(() => {
      setPingInfo(pingRef.current || 0);
    }, [pingRef.current])
    useEffect(() => {
      let animationTimer: NodeJS.Timeout | null = null;
      let cooldownInterval: NodeJS.Timeout | null = null;

      const checkCooldown = () => {
        if (grenadeCoolDownRef.current === false) {
          setShowCooldown(true);
          let remaining = 5; // assuming 5 seconds cooldown
          setCooldownTimeLeft(remaining);

          cooldownInterval = setInterval(() => {
            remaining -= 1;
            setCooldownTimeLeft(remaining);
            if (remaining <= 0) {
              setShowCooldown(false);
              clearInterval(cooldownInterval!);
            }
          }, 1000);
        }
      };

      const interval = setInterval(checkCooldown, 200);

      return () => {
        clearInterval(interval);
        if (animationTimer) clearTimeout(animationTimer);
        if (cooldownInterval) clearInterval(cooldownInterval);
      };
    }, []);


    return (
      <>
        {/* Health & Kills - Top Left */}
        <HudBox position="top-4 left-4" className="w-48">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <Heart size={18} className="text-red-500 mr-2" />
              <span className="text-sm font-medium">Health</span>
            </div>
            <span className="font-bold text-red-400">{health}%</span>
          </div>

          <div className="w-full bg-gray-700/60 rounded-full h-2">
            <div
              className="bg-red-500 h-2 rounded-full"
              style={{ width: `${health}%` }}
            />
          </div>

          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center">
              <Crosshair size={18} className="text-yellow-400 mr-2" />
              <span className="text-sm font-medium">Kills</span>
            </div>
            <span className="font-bold text-yellow-400">{kills}</span>
          </div>
        </HudBox>
        <HudBox position="top-32 left-4" className="flex items-center space-x-2">
          {showCooldown ? (
            <svg
              className="h-5 w-5 text-red-400 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8z"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 2a2 2 0 00-2 2v2a2 2 0 002 2h1v10a3 3 0 106 0V8h1a2 2 0 002-2V4a2 2 0 00-2-2H7z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 14v.01"
              />
            </svg>
          )}
          <span className={`font-bold ${showCooldown ? 'text-red-400' : 'text-green-400'}`}>
            {showCooldown ? `${cooldownTimeLeft}s` : 'Ready'}
          </span>
        </HudBox>


        {/* Ammo - Bottom Right */}
        <HudBox position="bottom-4 right-4" className="px-2 py-1 text-xs bg-black/70 rounded shadow flex items-center space-x-3">
          <div className="flex items-center space-x-1">
            <Target size={14} className="text-orange-400" />
            <span className="text-orange-400 font-semibold">{ammoRef.current}</span>
          </div>
          <div className="flex items-center space-x-1">
            /
          </div>
          <div className="flex items-center space-x-1">

            <span className="text-gray-200 font-semibold">{bulletsAvailable}</span>
          </div>
        </HudBox>

        {/* Game Info - Top Right */}
        <HudBox position="top-4 right-4" className="min-w-48">
          <div className="flex items-center mb-2">
            <Users size={18} className="text-cyan-400 mr-2" />
            <span className="text-sm font-medium text-cyan-400">Game Info</span>
          </div>

          <div className="flex justify-between text-xs mb-1">
            <span>Room:</span>
            <span className="font-medium">{roomId ?? 'Not joined'}</span>
          </div>
          <div className="flex justify-between text-xs mb-1">
            <span>UserId:</span>
            <span className="font-medium">{userid ?? 'Not joined'}</span>
          </div>
          <br />
          <div className="flex justify-between text-xs mb-1 items-center">
            <span>Ping:</span>
            <span className="flex items-center space-x-2">
              <span
                className={`font-medium ${pingInfo < 50 ? 'text-green-400' :
                  pingInfo < 100 ? 'text-yellow-400' : 'text-red-400'
                  }`}
              >
                {pingInfo ?? 'Not Connected'} ms
              </span>
              <div className="flex space-x-1 items-end">
                <div className={`w-1 h-2 ${pingInfo > 0 ? 'bg-green-400' : 'bg-gray-600'} rounded-sm`} />
                <div className={`w-1 h-2.5 ${pingInfo > 50 ? 'bg-green-400' : 'bg-gray-600'} rounded-sm`} />
                <div className={`w-1 h-3 ${pingInfo > 75 ? 'bg-yellow-400' : 'bg-gray-600'} rounded-sm`} />
                <div className={`w-1 h-3.5 ${pingInfo > 100 ? 'bg-red-400' : 'bg-gray-600'} rounded-sm`} />
              </div>
            </span>
          </div>

        </HudBox>
        {isPlayerDead?.current && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
            <div className="text-center">
              <h1 className="text-white text-4xl font-bold mb-4">You Died</h1>
              <p className="text-gray-300 text-lg">Wait for respawn...</p>
            </div>
          </div>
        )}
      </>
    );
  }
);

export default GameInfo;