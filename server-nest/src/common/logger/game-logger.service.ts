import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GameLoggerService {
  private readonly logger = new Logger('Game');

  log(message: string) {
    this.logger.log(message);
  }

  warn(message: string) {
    this.logger.warn(message);
  }

  error(message: string, trace?: string) {
    this.logger.error(message, trace);
  }
}