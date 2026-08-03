import { Module } from '@nestjs/common';

import { RedisModule } from '../redis/redis.module';
import { PlayersService } from './players.service';

@Module({
  imports: [RedisModule],
  providers: [PlayersService],
  exports: [PlayersService],
})
export class PlayersModule {}