import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { runWithTenantContext } from './tenant-context';

/**
 * Mantiene TenantContext durante toda la suscripcion RxJS que ejecuta
 * controlador, servicio y repositorios. Un guard asincrono puede
 * autenticar y adjuntar request.user, pero no puede envolver de forma
 * fiable el resto del pipeline de Nest dentro de AsyncLocalStorage.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AccessTokenPayload }>();
    const user = request.user;

    if (!user) {
      return next.handle();
    }

    const correlationId =
      (request.headers['x-correlation-id'] as string | undefined) ??
      randomUUID();

    return new Observable((subscriber) =>
      runWithTenantContext(
        {
          tenantId: user.tenantId,
          userId: user.sub,
          correlationId,
        },
        () =>
          next.handle().subscribe({
            next: (value) => subscriber.next(value),
            error: (error: unknown) => subscriber.error(error),
            complete: () => subscriber.complete(),
          }),
      ),
    );
  }
}
