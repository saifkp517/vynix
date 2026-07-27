import { Module } from '@nestjs/common';

import { TerrainService } from './terrain.service';

@Module({
  providers: [TerrainService],
  exports: [TerrainService],
})
export class TerrainModule {}
