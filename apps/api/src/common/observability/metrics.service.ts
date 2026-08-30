import { Injectable } from '@nestjs/common';

/**
 * Contador de metricas en memoria (Fase 1).
 * Suficiente para el criterio "Metricas" de la seccion 10.2 --
 * un backend de metricas mas robusto (Prometheus, etc.) es una
 * decision de infraestructura posterior, no bloqueante para Fase 1.
 */
@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, number>();

  increment(name: string): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + 1);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters);
  }
}
