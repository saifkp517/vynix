import { Injectable } from '@nestjs/common';
import { Vector3 } from 'three';

import { PlayersService } from '../players/players.service';
import { PhysicsService } from '../physics/physics.service';

@Injectable()
export class MovementService {
  constructor(
    private readonly playersService: PlayersService,
    private readonly physicsService: PhysicsService,
  ) {}

  /**
   * Persists the new transform in Redis, updates the in-memory grid, and
   * returns the socket IDs that should receive the playerMoved broadcast.
   * The Gateway handles the actual emit.
   */
  async process(
    socketId: string,
    roomId: string,
    position: Vector3,
    velocity: Vector3,
    cameraDirection: Vector3,
  ): Promise<{ nearbySocketIds: string[] }> {
    await this.playersService.updatePlayerInRoom(roomId, socketId, {
      position,
      velocity,
      cameraDirection,
    });

    const nearbySocketIds = this.physicsService.updatePlayerCell(
      roomId,
      socketId,
      position,
    );

    return { nearbySocketIds };
  }
}
