import { Controller, Get } from '@nestjs/common';

/**
 * Criterio de Fase 1: "Versionado" (Observability, 10.2).
 */
@Controller('version')
export class VersionController {
  @Get()
  get() {
    return {
      service: 'coffeeos-api',
      apiVersion: 'v1',
      buildVersion: process.env.BUILD_VERSION ?? '0.1.0-fase1',
    };
  }
}
