import React, { RefObject, useMemo } from "react";
import { Vector3 } from "three";

interface RadarUIProps {
  myPlayerId: string;
  myPosition: Vector3;
  playerDataRef: RefObject<{ [playerId: string]: { user: any; position: Vector3; velocity: Vector3; cameraDirection: Vector3 } }>;
  cameraDirection: Vector3;
}

export const RadarUI: React.FC<RadarUIProps> = ({
  myPlayerId,
  myPosition,
  playerDataRef,
  cameraDirection
}) => {


  // Radar dimensions
  const radarSize = 180;
  const radius = radarSize / 2;
  const maxWorldDistance = 50; // Max distance shown on radar

  const calculateAngleToPlayer = (playerPos: Vector3): number => {

    const toPlayer = new Vector3(
      playerPos.x - myPosition.x,
      0,
      playerPos.z - myPosition.z
    )

    if (toPlayer.lengthSq() === 0) {
      return 0;
    }

    toPlayer.normalize();

    const facing = new Vector3(
      cameraDirection.x,
      0,
      cameraDirection.z
    ).normalize();

    const angleToPlayerRad = Math.atan2(toPlayer.x, toPlayer.z);
    const angleFacingRad = Math.atan2(facing.x, facing.z);

    //if angleDiffRad > 0 player is to your left or vice.versa
    let angleDiffRad = angleToPlayerRad - angleFacingRad;

    //normalize to -180 and 180
    angleDiffRad = (angleDiffRad + Math.PI) % (2 * Math.PI) - Math.PI;

    // Convert to degrees
    const angleDiffDeg = angleDiffRad * (180 / Math.PI);

    return -angleDiffDeg;
  };

  const calculateDistanceToPlayer = (playerPos: Vector3): number => {
    return myPosition.distanceTo(playerPos);
  };

  // Convert your angle and distance to radar screen coordinates
  const angleDistanceToRadarCoords = (angleDegrees: number, distance: number) => {
    // Clamp distance to radar bounds
    const clampedDistance = Math.min(distance, maxWorldDistance);
    const scale = radius / maxWorldDistance;
    const radarDistance = clampedDistance * scale;

    // Convert angle to radians and adjust for screen coordinates
    const angleRadians = (angleDegrees * Math.PI) / 180;

    // Calculate screen position (0° = up/north)
    const x = radarDistance * Math.sin(angleRadians);
    const y = -radarDistance * Math.cos(angleRadians); // Negative because screen Y increases downward

    return { x, y };
  };
  

  const radarPlayers = useMemo(() => {
    if (!playerDataRef.current) return [];

    return Object.entries(playerDataRef.current)
      .filter(([playerId]) => playerId !== myPlayerId)
      .map(([playerId, data]: [string, { user: any; position: Vector3; velocity: Vector3; cameraDirection: Vector3 }]) => {
        const angle = calculateAngleToPlayer(data.position);
        const distance = calculateDistanceToPlayer(data.position);
        const { x, y } = angleDistanceToRadarCoords(angle, distance);

        return {
          playerId,
          x,
          y,
          distance
        };
      });
  }, [myPlayerId, myPosition, cameraDirection, playerDataRef.current]);

  return (
    <div className="fixed bottom-4 right-4 select-none">

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
        {[0.2, 0.4, 0.6, 0.8].map((frac, index) => (
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




        {/* My player (center dot) */}
        <div
          className=""
          style={{
            left: radius - 8,
            top: radius - 8,
          }}
        />

        {/* Other players */}
        {radarPlayers.map(({ playerId, x, y }) => (
          <div
            key={playerId} // Remove pingTime from key
            className="absolute w-2 h-2 bg-red-500 rounded-full border border-red-300 transition-all duration-75" // Add smooth transition
            style={{
              left: radius + x - 4,
              top: radius + y - 4,
            }}
          />
        ))}

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