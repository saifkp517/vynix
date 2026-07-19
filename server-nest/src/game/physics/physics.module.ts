import { Module } from '@nestjs/common';

import { PhysicsService } from './physics.service';
import { PlayersModule } from '../players/players.module';

@Module({
  imports: [PlayersModule],
  providers: [PhysicsService],
  exports: [PhysicsService],
})
export class PhysicsModule {}