import { Module } from '@nestjs/common';

import { BotsService } from './bots.service';
import { PlayersModule } from '../players/players.module';
import { MovementModule } from '../movement/movement.module';
import { PhysicsModule } from '../physics/physics.module';
import { CombatModule } from '../combat/combat.module';

@Module({
  imports: [PlayersModule, MovementModule, PhysicsModule, CombatModule],
  providers: [BotsService],
  exports: [BotsService],
})
export class BotsModule {}
