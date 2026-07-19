import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { GatewayModule } from './game/gateway/gateway.module';
import { AppService } from './app.service';
import { GameModule } from './game/game.module';
import { RoomsModule } from './game/rooms/rooms.module';
import { PlayersModule } from './game/players/players.module';

@Module({
  imports: [
    GameModule,
    RoomsModule,
    PlayersModule,
    GatewayModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
