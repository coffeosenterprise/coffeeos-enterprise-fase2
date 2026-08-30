import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TenantSubscriptionModule } from '../tenant-subscription/tenant-subscription.module';

import { AuthController } from './presentation/auth.controller';
import { UsersController } from './presentation/users.controller';
import { RolesController } from './presentation/roles.controller';

import { AuthService } from './application/auth.service';
import { UserService } from './application/user.service';
import { TokenService } from './application/token.service';

import { UserRepository } from './infrastructure/user.repository';
import { SessionRepository } from './infrastructure/session.repository';
import { RoleRepository } from './infrastructure/role.repository';

import { PasswordHasher } from '../../common/security/password-hasher';
import { EmailVerificationService } from './application/email-verification.service';

/**
 * Bounded Context: Identity & Access
 * Fase 1 (Libro 05, 10.2).
 *
 * Fase 1 v1.3, correccion #1: importa TenantSubscriptionModule de
 * forma NORMAL (sin forwardRef) porque, tras extraer el bootstrap del
 * Owner a TenantProvisioningModule, TenantSubscriptionModule ya NO
 * importa de vuelta a este modulo -- la dependencia quedo
 * unidireccional (Identity -> Tenant, para resolver el Tenant por
 * slug en Login/Recuperacion). Ver ADR-021 para el detalle completo
 * de por que esto reemplaza al ciclo resuelto con forwardRef() en la
 * v1.1/v1.2.
 */
@Module({
  imports: [
    JwtModule.register({
      // JwtAuthGuard se usa tambien en controladores de otros modulos
      // (Audit, Tenant y Organization). Hacer global JwtModule permite
      // que Nest inyecte JwtService al crear el guard en esos contextos.
      global: true,
      // El fallback solo es alcanzable en Local/Development/Testing:
      // validateEnvironmentOrExit() aborta el arranque en
      // Staging/Production si JWT_SECRET no esta configurado.
      secret: process.env.JWT_SECRET ?? 'LOCAL_DEV_ONLY_INSECURE_SECRET',
      signOptions: { algorithm: 'HS256' },
    }),
    TenantSubscriptionModule,
  ],
  controllers: [AuthController, UsersController, RolesController],
  providers: [
    AuthService,
    UserService,
    TokenService,
    UserRepository,
    SessionRepository,
    RoleRepository,
    PasswordHasher,
    EmailVerificationService,
  ],
  exports: [RoleRepository, UserRepository, PasswordHasher],
})
export class IdentityAccessModule {}
