import { Module } from '@nestjs/common';

import { PhysicsService } from './physics.service';
import { PlayersModule } from '../players/players.module';
import { TerrainModule } from '../terrain/terrain.module';

@Module({
  imports: [PlayersModule, TerrainModule],
  providers: [PhysicsService],
  exports: [PhysicsService],
})
export class PhysicsModule {}