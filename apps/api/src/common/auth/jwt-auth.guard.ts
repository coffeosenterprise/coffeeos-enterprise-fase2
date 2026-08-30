import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AccessTokenPayload } from './jwt.types';

/**
 * Valida el JWT de acceso (ADR-008: JWT + Refresh Token Rotation) y
 * fija el TenantContext a partir del tenantId del token -- ese es el
 * unico lugar del sistema donde el tenant de una peticion HTTP
 * autenticada se decide (Fase 1, correccion #1).
 *
 * A partir de aqui, todo el pipeline restante (Interceptors, Pipes,
 * Controller, Service, Repository, PrismaService.withTenantContext)
 * ve el mismo TenantContext sin tener que pasarlo explicitamente.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token de acceso no proporcionado');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Token de acceso invalido o expirado');
    }

    (request as Request & { user: AccessTokenPayload }).user = payload;

    return true;
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [type, token] = header.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
