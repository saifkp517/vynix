import { RefObject, useCallback, useEffect, useState } from "react";
import { Vector3 } from "three";

interface PlayerData {
  user: any;
  position: Vector3;
  velocity: Vector3;
  cameraDirection: Vector3;
}

interface RadarPlayer {
  playerId: string;
  x: number;
  y: number;
  distance: number;
}

interface UseRadarOptions {
  myPlayerId: string;
  playerDataRef: RefObject<{ [playerId: string]: PlayerData }>;
  radarSize?: number;
  maxWorldDistance?: number;
}

interface CameraUpdateEvent {
  position: Vector3;
  direction: Vector3;
}

export const useRadar = ({
  myPlayerId,
  playerDataRef,
  radarSize = 180,
  maxWorldDistance = 500,
}: UseRadarOptions) => {
  const radius = radarSize / 2;

  const [radarPlayers, setRadarPlayers] = useState<RadarPlayer[]>([]);
  const [myPosition, setMyPosition] = useState<Vector3>(new Vector3());
  const [myCameraDirection, setMyCameraDirection] = useState<Vector3>(
    new Vector3(0, 0, -1)
  );

  const calculateAngleToPlayer = useCallback(
    (myPos: Vector3, playerPos: Vector3, facing: Vector3): number => {
      const toPlayer = new Vector3(
        playerPos.x - myPos.x,
        0,
        playerPos.z - myPos.z
      );

      if (toPlayer.lengthSq() === 0) {
        return 0;
      }

      toPlayer.normalize();

      const facingNormalized = new Vector3(facing.x, 0, facing.z).normalize();

      const angleToPlayerRad = Math.atan2(toPlayer.x, toPlayer.z);
      const angleFacingRad = Math.atan2(facingNormalized.x, facingNormalized.z);

      let angleDiffRad = angleToPlayerRad - angleFacingRad;

      // Normalize to -π and π
      angleDiffRad = ((angleDiffRad + Math.PI) % (2 * Math.PI)) - Math.PI;

      // Convert to degrees
      const angleDiffDeg = angleDiffRad * (180 / Math.PI);

      return -angleDiffDeg;
    },
    []
  );

  const angleDistanceToRadarCoords = useCallback(
    (angleDegrees: number, distance: number) => {
      const clampedDistance = Math.min(distance, maxWorldDistance);
      const scale = radius / maxWorldDistance;
      const radarDistance = clampedDistance * scale;

      const angleRadians = (angleDegrees * Math.PI) / 180;

      const x = radarDistance * Math.sin(angleRadians);
      const y = -radarDistance * Math.cos(angleRadians);

      return { x, y };
    },
    [radius, maxWorldDistance]
  );

  // Event listener for camera updates
  const handleCameraUpdate = useCallback(
    (event: CustomEvent<CameraUpdateEvent>) => {

      console.log('🎯 Radar hook received camera update:', {
        timestamp: Date.now(),
        position: event.detail.position,
        direction: event.detail.direction,
        playerDataKeys: playerDataRef.current ? Object.keys(playerDataRef.current).length : 0, // Quick check for data presence
      });

      const { position, direction } = event.detail;

      setMyPosition(position.clone());
      setMyCameraDirection(direction.clone());

      if (!playerDataRef.current) return;

      const players = Object.entries(playerDataRef.current)
        .filter(([id]) => id !== myPlayerId)
        .map(([id, data]) => {
          const angle = calculateAngleToPlayer(position, data.position, direction);
          const distance = position.distanceTo(data.position);
          const { x, y } = angleDistanceToRadarCoords(angle, distance);
          return { playerId: id, x, y, distance };
        });

      setRadarPlayers(players);
    },
    [
      myPlayerId,
      playerDataRef,
      calculateAngleToPlayer,
      angleDistanceToRadarCoords,
    ]
  );

  // Set up event listener
  useEffect(() => {
    const listener = (e: Event) => handleCameraUpdate(e as CustomEvent<CameraUpdateEvent>);
    window.addEventListener("radar:cameraUpdate", listener);
    return () => window.removeEventListener("radar:cameraUpdate", listener);
  }, [handleCameraUpdate]);

  return {
    radarPlayers,
    myPosition,
    myCameraDirection,
    radarSize,
    maxWorldDistance,
  };
};

// Helper function to emit camera updates from your game loop
export const emitCameraUpdate = (position: Vector3, direction: Vector3) => {
  window.dispatchEvent(
    new CustomEvent<CameraUpdateEvent>("radar:cameraUpdate", {
      detail: { position, direction },
    })
  );
};