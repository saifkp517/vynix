import { Module } from '@nestjs/common';

import { MatchmakingService } from './matchmaking.service';
import { RedisModule } from '../redis/redis.module';
import { PlayersModule } from '../players/players.module';
import { PhysicsModule } from '../physics/physics.module';

@Module({
  imports: [RedisModule, PlayersModule, PhysicsModule],
  providers: [MatchmakingService],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
