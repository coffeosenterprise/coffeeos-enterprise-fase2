import { Controller, Get } from '@nestjs/common';

/**
 * Health check obligatorio de Fase 0.
 * No requiere autenticación ni contexto de tenant.
 */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'coffeeos-api',
      timestamp: new Date().toISOString(),
    };
  }
}
