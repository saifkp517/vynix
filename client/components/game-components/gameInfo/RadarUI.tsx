import React, { useEffect, useState } from "react";
import { Vector3 } from "three";

interface Position {
  id: string;
  position: Vector3;
}

interface RadarUIProps {
  myPosition: Vector3;
  cameraDirection: Vector3; // should be a unit vector
  radarArrayRef: React.RefObject<Position[]>;
}

export const RadarUI: React.FC<RadarUIProps> = ({
  myPosition,
  cameraDirection,
  radarArrayRef,
}) => {
  const [players, setPlayers] = useState<Position[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      // Pull latest radar data every 2s
      setPlayers([...radarArrayRef.current]);
    }, 2000);

    return () => clearInterval(interval);
  }, [radarArrayRef]);

  // Radar dimensions
  const radarSize = 150; // px
  const radius = radarSize / 2;

  // Scale world distance -> radar distance
  const maxWorldDistance = 50; // adjust for your game world
  const scale = radius / maxWorldDistance;

  // Convert world coords -> radar coords
  const worldToRadar = (target: Vector3) => {
    const offset = new Vector3().subVectors(target, myPosition);

    // project offset onto 2D plane (ignore Y axis)
    const relative = new Vector3(offset.x, 0, offset.z);

    // rotate based on camera forward direction (so radar aligns with camera)
    const angleToNorth = Math.atan2(cameraDirection.x, cameraDirection.z);
    const cos = Math.cos(-angleToNorth);
    const sin = Math.sin(-angleToNorth);

    const rotatedX = relative.x * cos - relative.z * sin;
    const rotatedY = relative.x * sin + relative.z * cos;

    // scale down to radar size
    const scaledX = rotatedX * scale;
    const scaledY = rotatedY * scale;

    // clamp to radar bounds
    const clampedX = Math.max(-radius, Math.min(radius, scaledX));
    const clampedY = Math.max(-radius, Math.min(radius, scaledY));

    return { x: clampedX, y: clampedY };
  };

  return (
    <div
      className="fixed bottom-4 right-4 rounded-full border border-green-400 bg-black/70 flex items-center justify-center"
      style={{ width: radarSize, height: radarSize }}
    >
      {/* My player (center dot) */}
      <div
        className="absolute w-3 h-3 bg-green-400 rounded-full"
        style={{
          left: radius - 6 / 2,
          top: radius - 6 / 2,
        }}
      />

      {/* Other players */}
      {players.map((p) => {
        const { x, y } = worldToRadar(p.position);
        return (
          <div
            key={p.id}
            className="absolute w-2 h-2 bg-red-500 rounded-full shadow-md"
            style={{
              left: radius + x - 2,
              top: radius + y - 2,
            }}
          />
        );
      })}
    </div>
  );
};

export default RadarUI;
