import { Module } from '@nestjs/common';

import { CombatService } from './combat.service';
import { RedisModule } from '../redis/redis.module';
import { PlayersModule } from '../players/players.module';
import { PhysicsModule } from '../physics/physics.module';

@Module({
  imports: [RedisModule, PlayersModule, PhysicsModule],
  providers: [CombatService],
  exports: [CombatService],
})
export class CombatModule {}
