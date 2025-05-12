import React from 'react';
import { Shield, Heart, Crosshair, Target, Clock, Users  } from 'lucide-react';

interface GameInfoProps {
  roomId: string | null;
  userid: string | null;
  team: string | null;
  bulletsInChamber: number;
  bulletsAvailable: number;
  explosionTimeout: number | null; // Seconds until explosion (e.g., grenade)
  health: number; // Player health (0-100)
  kills: number;
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
  ({ roomId, userid, team, bulletsInChamber, bulletsAvailable, explosionTimeout, health, kills }) => {
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
        <HudBox position="top-32 left-4" className='flex items-center space-x-2'>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 9a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 12v9m0 0H9m3 0h3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 0a9 9 0 110 18 9 9 0 010-18z" />
          </svg>
          <span className="font-bold text-red-400">{explosionTimeout}s</span>
        </HudBox>

        {/* Ammo - Bottom Right */}
        <HudBox position="bottom-4 right-4" className="px-2 py-1 text-xs bg-black/70 rounded shadow flex items-center space-x-3">
          <div className="flex items-center space-x-1">
            <Target size={14} className="text-orange-400" />
            <span className="text-orange-400 font-semibold">{bulletsInChamber}</span>
          </div>
          <div className="flex items-center space-x-1">
            /
          </div>
          <div className="flex items-center space-x-1">

            <span className="text-gray-200 font-semibold">{bulletsAvailable}</span>
          </div>
        </HudBox>


        {/* Controls - Bottom Left */}
        <HudBox position="bottom-4 left-4" className="w-48">
          <div className="text-xs font-medium mb-1 text-cyan-400">Controls</div>
          <div className="flex flex-wrap gap-1">
            <span className="bg-gray-700/60 px-2 py-1 rounded text-xs">WASD: Move</span>
            <span className="bg-gray-700/60 px-2 py-1 rounded text-xs">Mouse: Aim/Shoot</span>
            <span className="bg-gray-700/60 px-2 py-1 rounded text-xs">R: Reload</span>
            <span className="bg-gray-700/60 px-2 py-1 rounded text-xs">G: Grenade</span>
            <span className="bg-gray-700/60 px-2 py-1 rounded text-xs">ESC: Menu</span>
          </div>
        </HudBox>

        {/* Game Info - Top Right */}
        <HudBox position="top-4 right-4" className="w-48">
          <div className="flex items-center mb-2">
            <Users size={18} className="text-cyan-400 mr-2" />
            <span className="text-sm font-medium text-cyan-400">Game Info</span>
          </div>

          <div className="flex justify-between text-xs mb-1">
            <span>Room:</span>
            <span className="font-medium">{roomId ?? 'Not joined'}</span>
            <span className="font-medium">{userid ?? 'Not joined'}</span>
          </div>

          <div className="flex justify-between text-xs">
            <span>Team:</span>
            <span
              className={`font-medium ${team === 'red' ? 'text-red-400' :
                team === 'blue' ? 'text-blue-400' : 'text-gray-300'
                }`}
            >
              {team ?? 'No team'}
            </span>
          </div>
        </HudBox>

      </>
    );
  }
);

export default GameInfo;