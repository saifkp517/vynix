import { Module } from '@nestjs/common';

import { RedisModule } from './redis/redis.module';
import { PlayersModule } from './players/players.module';
import { RoomsModule } from './rooms/rooms.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { PhysicsModule } from './physics/physics.module';
import { SocketStateModule } from './socket-state/socket-state.module';
import { GameController } from './game.controller';

@Module({
  imports: [
    RedisModule,
    PlayersModule,
    RoomsModule,
    MatchmakingModule,
    SocketStateModule,
    PhysicsModule
  ],
  controllers: [GameController],
})
export class GameModule {}