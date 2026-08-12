import { Controller, Get } from '@nestjs/common';

import { SocketStateService } from './socket-state/socket-state.service';

@Controller('game')
export class GameController {
  constructor(private readonly socketState: SocketStateService) {}

  @Get('onlinePlayers')
  getOnlinePlayers() {
    return { players: this.socketState.count() };
  }
}
