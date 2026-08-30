import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Filtro global de excepciones.
 * Criterio de salida de Fase 1 (Libro 05, 10.3):
 * "Todos los errores incluyen Correlation ID."
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId =
      (request.headers['x-correlation-id'] as string) ?? 'unknown';

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Error interno del servidor';

    if (!(exception instanceof HttpException)) {
      // El detalle queda solo en los logs del servidor; nunca se expone
      // al navegador. Esto permite diagnosticar un 500 usando su
      // correlationId sin filtrar datos internos al cliente.
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'Unhandled application error',
          correlationId,
          path: request.url,
          error:
            exception instanceof Error
              ? { name: exception.name, message: exception.message, stack: exception.stack }
              : String(exception),
        }),
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
