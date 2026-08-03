import { Module } from '@nestjs/common';

import { RedisModule } from '../redis/redis.module';
import { PlayersModule } from '../players/players.module';

import { RoomsService } from './rooms.service';

@Module({
  imports: [
    RedisModule,
    PlayersModule,
  ],

  providers: [RoomsService],

  exports: [RoomsService],
})
export class RoomsModule {}