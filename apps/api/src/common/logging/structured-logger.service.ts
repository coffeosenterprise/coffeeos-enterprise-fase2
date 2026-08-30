import { ConsoleLogger } from '@nestjs/common';

/**
 * Logging estructurado en JSON (requisito transversal de Fase 0).
 * Sustituye al logger por defecto de Nest en main.ts.
 */
export class StructuredLogger extends ConsoleLogger {
  log(message: string, context?: string): void {
    this.write('info', message, context);
  }

  error(message: string, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  warn(message: string, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: string, context?: string): void {
    this.write('debug', message, context);
  }

  private write(
    level: string,
    message: string,
    context?: string,
    trace?: string,
  ): void {
    const entry = {
      level,
      message,
      context,
      trace,
      timestamp: new Date().toISOString(),
    };
    process.stdout.write(JSON.stringify(entry) + '\n');
  }
}
