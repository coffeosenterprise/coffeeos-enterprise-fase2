import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from './permissions.decorator';
import type { AccessTokenPayload } from './jwt.types';

/**
 * Rechaza la peticion si el usuario autenticado no tiene todos los
 * permisos requeridos por el endpoint.
 * Criterio de salida de Fase 1: "Un usuario sin permiso recibe rechazo."
 * Debe ejecutarse SIEMPRE despues de JwtAuthGuard.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AccessTokenPayload }>();
    const userPermissions = request.user?.permissions ?? [];

    const hasAll = required.every((p) => userPermissions.includes(p));
    if (!hasAll) {
      throw new ForbiddenException(
        `Permiso(s) requerido(s) no concedido(s): ${required.join(', ')}`,
      );
    }
    return true;
  }
}
