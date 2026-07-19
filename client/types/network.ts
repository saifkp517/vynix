export type MovementPacket = {
  type: "movement";

  playerId: string;

  position: {
    x: number;
    y: number;
    z: number;
  };

  velocity: {
    x: number;
    y: number;
    z: number;
  };

  cameraDirection: {
    x: number;
    y: number;
    z: number;
  };

  timestamp: number;
};

export type NetworkPacket =
  | MovementPacket;