import { Module } from '@nestjs/common';

import { MovementService } from './movement.service';
import { PlayersModule } from '../players/players.module';
import { PhysicsModule } from '../physics/physics.module';

@Module({
  imports: [PlayersModule, PhysicsModule],
  providers: [MovementService],
  exports: [MovementService],
})
export class MovementModule {}
