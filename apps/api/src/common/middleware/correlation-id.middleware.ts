import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { isValidUuid } from '../tenant/tenant-context';

/**
 * Genera o propaga un Correlation ID por request.
 * Requisito transversal de Fase 0 (Libro 04, cap. 17 — Observability).
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-correlation-id');
    const correlationId =
      incoming && isValidUuid(incoming) ? incoming : randomUUID();

    req.headers['x-correlation-id'] = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    next();
  }
}
