import { Module } from '@nestjs/common';

import { GameGateway } from './game.gateway';
import { SocketStateModule } from '../socket-state/socket-state.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { RoomsModule } from '../rooms/rooms.module';
import { PlayersModule } from '../players/players.module';
import { MovementModule } from '../movement/movement.module';
import { CombatModule } from '../combat/combat.module';
import { PhysicsModule } from '../physics/physics.module';
import { BotsModule } from '../bots/bots.module';
import { ProfilesModule } from '../../profiles/profiles.module';

@Module({
  imports: [
    SocketStateModule,
    MatchmakingModule,
    RoomsModule,
    PlayersModule,
    MovementModule,
    CombatModule,
    PhysicsModule,
    BotsModule,
    ProfilesModule,
  ],
  providers: [GameGateway],
  exports: [GameGateway],
})
export class GatewayModule {}
