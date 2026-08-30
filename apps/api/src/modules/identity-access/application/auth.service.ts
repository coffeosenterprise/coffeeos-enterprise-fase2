import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { UserRepository } from '../infrastructure/user.repository';
import { SessionRepository } from '../infrastructure/session.repository';
import { TenantRepository } from '../../tenant-subscription/infrastructure/tenant.repository';
import { TokenService } from './token.service';
import { PasswordHasher } from '../../../common/security/password-hasher';
import { AuditService } from '../../../common/audit/audit.service';
import {
  computeLockout,
  isAccountLocked,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from '../domain/user';
import {
  decodeCompositeToken,
  runWithTenantContext,
} from '../../../common/tenant/tenant-context';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

/**
 * Autenticacion (Libro 05, 10.2: Login, Logout, Refresh, Bloqueo, Sesiones).
 *
 * Fase 1 v1.1 -- correcciones #2 y #3:
 *  - login() resuelve el Tenant por slug ANTES de poder consultar
 *    `users` (que tiene RLS) -- el email por si solo no alcanza,
 *    porque el mismo email puede existir en Tenants distintos.
 *  - refresh() NUNCA requiere un Access Token valido: el propio
 *    refresh token (compuesto, ver ADR-019) trae el tenantId.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly tokenService: TokenService,
    private readonly passwordHasher: PasswordHasher,
    private readonly auditService: AuditService,
  ) {}

  async login(
    tenantSlug: string,
    email: string,
    password: string,
    context: { userAgent?: string; ipAddress?: string },
  ): Promise<LoginResult> {
    const tenant = await this.tenantRepository.findBySlug(tenantSlug);
    if (!tenant || tenant.status !== 'active') {
      // Mismo mensaje que credenciales invalidas: no revelar si el
      // tenant existe o no.
      throw new UnauthorizedException('Credenciales invalidas');
    }

    return runWithTenantContext(
      { tenantId: tenant.id, correlationId: randomUUID() },
      async () => {
        const user = await this.userRepository.findByEmail(email);

        if (!user || user.status !== 'active' || !user.passwordHash) {
          throw new UnauthorizedException('Credenciales invalidas');
        }

        if (isAccountLocked(user.lockedUntil)) {
          throw new UnauthorizedException(
            'Cuenta bloqueada temporalmente por intentos fallidos',
          );
        }

        const validPassword = await this.passwordHasher.verify(
          user.passwordHash,
          password,
        );

        if (!validPassword) {
          const failedAttempts = user.failedLoginAttempts + 1;
          const lockedUntil = computeLockout(failedAttempts);
          await this.userRepository.registerFailedLogin(
            user.id,
            failedAttempts,
            lockedUntil,
          );
          if (failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
            await this.auditService.record({
              actorId: user.id,
              action: 'USER_LOCKED_OUT',
              entity: 'user',
              entityId: user.id,
            });
          }
          throw new UnauthorizedException('Credenciales invalidas');
        }

        await this.userRepository.registerSuccessfulLogin(user.id);

        const permissions = this.extractPermissions(user);
        const accessToken = await this.tokenService.signAccessToken({
          sub: user.id,
          tenantId: tenant.id,
          permissions,
        });

        const refresh = this.tokenService.generateRefreshToken(tenant.id);
        await this.sessionRepository.create({
          userId: user.id,
          refreshTokenHash: refresh.hash,
          userAgent: context.userAgent,
          ipAddress: context.ipAddress,
          expiresAt: refresh.expiresAt,
        });

        await this.auditService.record({
          actorId: user.id,
          action: 'LOGIN_SUCCESS',
          entity: 'user',
          entityId: user.id,
        });

        return { accessToken, refreshToken: refresh.token };
      },
    );
  }

  async logout(userId: string): Promise<void> {
    await this.sessionRepository.revokeAllForUser(userId);
    await this.auditService.record({
      actorId: userId,
      action: 'LOGOUT',
      entity: 'user',
      entityId: userId,
    });
  }

  /**
   * No requiere JwtAuthGuard ni Access Token -- ese es exactamente
   * el caso que debe cubrir (Access Token ya expirado). El tenantId
   * viaja embebido en el propio refresh token.
   *
   * Fase 1 v1.2, correccion #2: la revocacion del token presentado y
   * la creacion del nuevo ocurren de forma atomica en
   * SessionRepository.rotate() -- ver ese metodo para el detalle de
   * como se evita el doble uso concurrente del mismo refresh token.
   */
  async refresh(presentedRefreshToken: string): Promise<LoginResult> {
    let tenantId: string;
    let secret: string;
    try {
      ({ tenantId, secret } = decodeCompositeToken(presentedRefreshToken));
    } catch {
      throw new UnauthorizedException('Refresh token invalido');
    }

    return runWithTenantContext(
      { tenantId, correlationId: randomUUID() },
      async () => {
        const hash = this.tokenService.hashRefreshSecret(secret);
        const nextRefresh = this.tokenService.generateRefreshToken(tenantId);

        const rotated = await this.sessionRepository.rotate(hash, {
          refreshTokenHash: nextRefresh.hash,
          expiresAt: nextRefresh.expiresAt,
        });

        if (!rotated) {
          throw new UnauthorizedException(
            'Refresh token invalido, revocado o ya utilizado',
          );
        }

        const user = await this.userRepository.findById(rotated.userId);
        if (!user || user.status !== 'active') {
          throw new UnauthorizedException('Usuario no encontrado o inactivo');
        }

        const permissions = this.extractPermissions(user);
        const accessToken = await this.tokenService.signAccessToken({
          sub: user.id,
          tenantId,
          permissions,
        });

        return { accessToken, refreshToken: nextRefresh.token };
      },
    );
  }

  private extractPermissions(user: {
    roles: { role: { permissions: { permission: { key: string } }[] } }[];
  }): string[] {
    const keys = new Set<string>();
    for (const userRole of user.roles) {
      for (const rp of userRole.role.permissions) {
        keys.add(rp.permission.key);
      }
    }
    return Array.from(keys);
  }
}
