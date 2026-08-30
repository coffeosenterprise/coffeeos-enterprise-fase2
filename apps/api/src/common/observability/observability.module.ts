import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { VersionController } from './version.controller';

@Global()
@Module({
  controllers: [MetricsController, VersionController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class ObservabilityModule {}
