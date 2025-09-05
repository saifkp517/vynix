import React, { useEffect, useState } from "react";
import { Vector3 } from "three";

interface PlayerData {
  user: any;
  position: Vector3;
  velocity: Vector3;
  cameraDirection: Vector3;
}

interface RadarUIProps {
  myPosition: Vector3;
  cameraDirection: Vector3; // should be a unit vector
  playerDataRef?: React.RefObject<{ [playerId: string]: PlayerData }>;
  myPlayerId: string; // Add this to exclude self from radar
}

export const RadarUI: React.FC<RadarUIProps> = ({
  myPosition,
  cameraDirection = new Vector3(0, 0, 0),
  playerDataRef,
  myPlayerId,
}) => {
  const [players, setPlayers] = useState<{ [playerId: string]: PlayerData }>({});
  const [pingTime, setPingTime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      // Pull latest radar data every 2s
      if (playerDataRef?.current) {
        setPlayers({ ...playerDataRef.current });
        setPingTime(Date.now());
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [playerDataRef]);

  // Radar dimensions
  const radarSize = 180; // Bigger for submarine look
  const radius = radarSize / 2;

  // Scale world distance -> radar distance
  const maxWorldDistance = 50; // adjust for your game world
  const scale = radius / maxWorldDistance;

  // Calculate camera bearing (0° = North, 90° = East)
  const cameraBearing = Math.atan2(-cameraDirection.x, -cameraDirection.z) * (180 / Math.PI);
  const normalizedBearing = ((cameraBearing % 360) + 360) % 360;

  // Convert world coords -> radar coords
  const worldToRadar = (target: Vector3) => {
    const offset = new Vector3().subVectors(target, myPosition);

    // Use standard coordinate mapping: X=east/west, Z=north/south
    const worldX = offset.x; // East is positive X
    const worldZ = offset.z; // North is positive Z (in Three.js, typically negative Z is forward)

    // Calculate camera's rotation angle (angle from north)
    const cameraAngle = Math.atan2(-cameraDirection.x, -cameraDirection.z);

    // Rotate the offset to align with camera direction
    const cos = Math.cos(-cameraAngle);
    const sin = Math.sin(-cameraAngle);

    const rotatedX = worldX * cos - worldZ * sin;
    const rotatedZ = worldX * sin + worldZ * cos;

    // Scale to radar coordinates
    const radarX = rotatedX * scale;
    const radarY = -rotatedZ * scale; // Negative because screen Y increases downward

    // Clamp to radar bounds
    const clampedX = Math.max(-radius, Math.min(radius, radarX));
    const clampedY = Math.max(-radius, Math.min(radius, radarY));

    return { x: clampedX, y: clampedY };
  };

  // Concentric circles for distance
  const ringFractions = [0.2, 0.4, 0.6, 0.8];

  return (
    <div className="fixed bottom-4 right-4 select-none">
      {/* Bearing display */}
      <div className="bg-black/90 border border-green-400 rounded-lg px-3 py-1 mb-2 text-center">
        <div className="text-green-400 text-xs font-mono">BEARING</div>
        <div className="text-green-300 text-lg font-mono font-bold">
          {Math.round(normalizedBearing).toString().padStart(3, '0')}°
        </div>
      </div>

      {/* Main radar display */}
      <div
        className="rounded-full border-2 border-green-400 bg-black/90 flex items-center justify-center relative overflow-hidden p-2"
        style={{ width: radarSize, height: radarSize }}
      >
        {/* Radar sweep effect */}
        <div 
          className="absolute inset-0 rounded-full animate-radar-sweep"
          style={{
            background: `conic-gradient(from 0deg, 
              transparent 0deg, 
              rgba(34, 197, 94, 0.1) 30deg, 
              rgba(34, 197, 94, 0.3) 60deg, 
              transparent 90deg, 
              transparent 360deg)`
          }}
        />

        {/* Range rings */}
        {ringFractions.map((frac, index) => (
          <div
            key={index}
            className="absolute rounded-full border border-green-300/40"
            style={{
              width: radarSize * frac,
              height: radarSize * frac,
              left: (radarSize * (1 - frac)) / 2,
              top: (radarSize * (1 - frac)) / 2,
            }}
          />
        ))}

        {/* Cardinal direction lines */}
        <div className="absolute w-full h-0.5 bg-green-300/30" style={{ top: '50%' }} />
        <div className="absolute h-full w-0.5 bg-green-300/30" style={{ left: '50%' }} />

        {/* Compass markings */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <div
            key={angle}
            className="absolute w-0.5 h-4 bg-green-300/60"
            style={{
              top: 8,
              left: '50%',
              transformOrigin: '50% 82px',
              transform: `translateX(-50%) rotate(${angle}deg)`,
            }}
          />
        ))}

        {/* Compass labels */}
        <div
          className="absolute text-green-300 text-sm font-bold font-mono"
          style={{ top: -25, left: '50%', transform: 'translateX(-50%)' }}
        >
          N
        </div>
        <div
          className="absolute text-green-300 text-sm font-bold font-mono"
          style={{ bottom: -25, left: '50%', transform: 'translateX(-50%)' }}
        >
          S
        </div>
        <div
          className="absolute text-green-300 text-sm font-bold font-mono"
          style={{ left: -25, top: '50%', transform: 'translateY(-50%)' }}
        >
          W
        </div>
        <div
          className="absolute text-green-300 text-sm font-bold font-mono"
          style={{ right: -25, top: '50%', transform: 'translateY(-50%)' }}
        >
          E
        </div>

        {/* Camera direction pointer */}
        <div
          className="absolute w-1 bg-yellow-400 shadow-lg animate-pulse-yellow"
          style={{
            height: radius - 10,
            left: '50%',
            top: 10,
            transformOrigin: '50% 80px',
            transform: `translateX(-50%) rotate(0deg)`,
          }}
        />

        {/* Camera direction arrow tip */}
        <div
          className="absolute w-0 h-0 border-l-2 border-r-2 border-b-4 border-l-transparent border-r-transparent border-b-yellow-400 animate-pulse-yellow"
          style={{
            left: '50%',
            top: 8,
            transform: 'translateX(-50%)',
          }}
        />

        {/* My player (center dot) */}
        <div
          className="absolute w-4 h-4 bg-green-400 rounded-full animate-pulse-green border border-green-200"
          style={{
            left: radius - 8,
            top: radius - 8,
          }}
        />

        {/* Other players */}
        {Object.entries(players)
          .filter(([playerId]) => playerId !== myPlayerId) // Exclude self
          .map(([playerId, playerData]) => {
            const { x, y } = worldToRadar(playerData.position);
            return (
              <div
                key={`${playerId}-${pingTime}`}
                className="absolute w-2 h-2 bg-red-400 rounded-full shadow-lg animate-fade-out border border-red-200"
                style={{
                  left: radius + x - 4,
                  top: radius + y - 4,
                }}
              />
            );
          })}

        {/* Range indicator */}
        <div 
          className="absolute bottom-2 left-2 text-green-300 text-xs font-mono bg-black/70 px-2 py-1 rounded"
        >
          {maxWorldDistance}m
        </div>

        {/* CSS for animations */}
        <style>
          {`
            @keyframes pulse-green {
              0% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
              50% { transform: scale(1.1); opacity: 0.8; }
              70% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
              100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
            }
            @keyframes pulse-yellow {
              0% { opacity: 1; }
              50% { opacity: 0.6; }
              100% { opacity: 1; }
            }
            @keyframes fade-out {
              0% { opacity: 1; transform: scale(1); }
              100% { opacity: 0; transform: scale(1.3); }
            }
            @keyframes radar-sweep {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            .animate-pulse-green {
              animation: pulse-green 2s ease-in-out infinite;
            }
            .animate-pulse-yellow {
              animation: pulse-yellow 1s ease-in-out infinite;
            }
            .animate-fade-out {
              animation: fade-out 2s linear forwards;
            }
            .animate-radar-sweep {
              animation: radar-sweep 4s linear infinite;
            }
          `}
        </style>
      </div>
    </div>
  );
};

export default RadarUI;