import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { GatewayModule } from './game/gateway/gateway.module';
import { AppService } from './app.service';
import { GameModule } from './game/game.module';
import { RoomsModule } from './game/rooms/rooms.module';
import { PlayersModule } from './game/players/players.module';
import { DatabaseModule } from './database/database.module';
import { ProfilesModule } from './profiles/profiles.module';

@Module({
  imports: [
    DatabaseModule,
    GameModule,
    RoomsModule,
    PlayersModule,
    ProfilesModule,
    GatewayModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
