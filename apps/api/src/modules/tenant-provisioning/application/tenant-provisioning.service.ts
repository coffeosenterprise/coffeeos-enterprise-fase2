import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantRepository } from '../../tenant-subscription/infrastructure/tenant.repository';
import { PasswordHasher } from '../../../common/security/password-hasher';
import { PrismaService } from '../../../common/database/prisma.service';
import { isValidUuid } from '../../../common/tenant/tenant-context';
import { DEFAULT_SYSTEM_ROLES } from '../../identity-access/domain/default-roles';
import { FaultInjector } from '../../../common/testing/fault-injector';
import { EmailService } from '../../../common/email/email.service';
import {
  generateVerificationCode,
  hashVerificationCode,
} from '../../../common/security/verification-code';
import { shouldExposeDevelopmentSecrets } from '../../../common/config/environment';

export const PROVISIONING_CHECKPOINT_AFTER_FIRST_AUDIT_LOG =
  'tenant-provisioning:after-first-audit-log';

export interface CreateTenantInput {
  name: string;
  slug: string;
  plan?: string;
  owner: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
  };
}

/**
 * Tenant Provisioning -- capa de orquestacion (Fase 1 v1.3, correccion #1).
 *
 * NO es un Bounded Context de negocio: es un caso de uso de aplicacion
 * que coordina Tenant & Subscription Management e Identity & Access
 * para el UNICO momento en que ambos deben escribir en la misma
 * transaccion (el alta de un Tenant nuevo). Ninguno de los dos BCs
 * depende del otro -- ambos son dependencias de ESTE modulo, en una
 * sola direccion, sin ciclos. Ver ADR-021 para el razonamiento
 * completo de por que esto reemplaza al forwardRef() de la v1.1/v1.2.
 *
 * Sigue siendo atomico: todo el aprovisionamiento (Tenant, roles,
 * Owner, asignacion de rol, auditoria) ocurre dentro de una unica
 * `this.prisma.$transaction()`, exactamente igual que en la v1.2 --
 * lo unico que cambio es DONDE vive este codigo, no como funciona.
 */
@Injectable()
export class TenantProvisioningService {
  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async create(input: CreateTenantInput) {
    const existingSlug = await this.tenantRepository.findBySlug(input.slug);
    if (existingSlug) {
      throw new BadRequestException('El slug de Tenant ya esta en uso');
    }

    const ownerPasswordHash = await this.passwordHasher.hash(
      input.owner.password,
    );
    const verificationCode = generateVerificationCode();
    const verificationRequired =
      process.env.EMAIL_VERIFICATION_REQUIRED !== 'false';

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: input.name,
            slug: input.slug,
            plan: input.plan ?? 'starter',
            status: verificationRequired ? 'pending_verification' : 'active',
          },
        });

        if (!isValidUuid(tenant.id)) {
          throw new Error('Tenant creado con id invalido');
        }

        await tx.$executeRawUnsafe(
          `SET LOCAL app.current_tenant = '${tenant.id}'`,
        );

        const createdRoles = await Promise.all(
          DEFAULT_SYSTEM_ROLES.map((roleName) =>
            tx.role.create({
              data: { tenantId: tenant.id, name: roleName, isSystem: true },
            }),
          ),
        );

        const ownerRole = createdRoles.find(
          (r) => r.name === DEFAULT_SYSTEM_ROLES[0],
        );
        if (!ownerRole) {
          throw new Error('No se pudo sembrar el rol OWNER del Tenant');
        }

        const allPermissions = await tx.permission.findMany();
        await tx.rolePermission.createMany({
          data: allPermissions.map((p) => ({
            tenantId: tenant.id,
            roleId: ownerRole.id,
            permissionId: p.id,
          })),
        });

        const permissionsByKey = new Map(
          allPermissions.map((permission) => [permission.key, permission.id]),
        );
        const defaults: Record<string, string[]> = {
          ADMIN: [
            'catalog.manage',
            'inventory.manage',
            'sales.create',
            'cash.manage',
          ],
          MANAGER: [
            'catalog.manage',
            'inventory.manage',
            'sales.create',
            'cash.manage',
          ],
          CASHIER: ['sales.create', 'cash.manage'],
          BARISTA: ['sales.create'],
          WAREHOUSE: ['inventory.manage'],
        };
        const defaultRolePermissions = createdRoles.flatMap((role) =>
          (defaults[role.name] ?? []).flatMap((key) => {
            const permissionId = permissionsByKey.get(key);
            return permissionId
              ? [{ tenantId: tenant.id, roleId: role.id, permissionId }]
              : [];
          }),
        );
        if (defaultRolePermissions.length > 0) {
          await tx.rolePermission.createMany({
            data: defaultRolePermissions,
            skipDuplicates: true,
          });
        }

        const owner = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: input.owner.email,
            firstName: input.owner.firstName,
            lastName: input.owner.lastName,
            passwordHash: ownerPasswordHash,
            status: verificationRequired ? 'pending_verification' : 'active',
          },
        });

        await tx.userRole.create({
          data: { tenantId: tenant.id, userId: owner.id, roleId: ownerRole.id },
        });

        if (verificationRequired) {
          await tx.emailVerification.create({
            data: {
              tenantId: tenant.id,
              userId: owner.id,
              codeHash: hashVerificationCode(verificationCode),
              expiresAt: new Date(Date.now() + 15 * 60_000),
            },
          });
        }

        await tx.auditLog.create({
          data: {
            tenantId: tenant.id,
            action: 'TENANT_CREATED',
            entity: 'tenant',
            entityId: tenant.id,
            payload: { name: input.name, slug: input.slug, plan: tenant.plan } as never,
          },
        });

        // Fase 1 v1.4, correccion #1: punto de control para la prueba
        // de rollback tardio. En cualquier ambiente distinto a
        // NODE_ENV=test es un no-op puro -- ver FaultInjector. Se
        // coloca aqui deliberadamente: Tenant, roles, permisos del
        // OWNER, usuario Owner, UserRole y el PRIMER audit log ya se
        // ejecutaron con exito en esta misma transaccion cuando se
        // llega a esta linea.
        FaultInjector.checkpoint(PROVISIONING_CHECKPOINT_AFTER_FIRST_AUDIT_LOG);

        await tx.auditLog.create({
          data: {
            tenantId: tenant.id,
            actorId: owner.id,
            action: 'TENANT_OWNER_BOOTSTRAPPED',
            entity: 'user',
            entityId: owner.id,
          },
        });

        return { tenantId: tenant.id, slug: tenant.slug, ownerId: owner.id };
      });

      if (verificationRequired) {
        await this.emailService.sendVerificationCode({
          email: input.owner.email,
          businessName: input.name,
          code: verificationCode,
        });
      }

      return {
        tenantId: result.tenantId,
        slug: result.slug,
        verificationRequired,
        ...(verificationRequired && shouldExposeDevelopmentSecrets()
          ? { developmentCode: verificationCode }
          : {}),
      };
    } catch (error) {
      // Fase 1 v1.3, correccion #2: si dos requests concurrentes pasan
      // el pre-chequeo de arriba (findBySlug) antes de que ninguna
      // haya confirmado, la segunda choca con la restriccion UNIQUE de
      // `tenants.slug` DENTRO de la transaccion -- Prisma lo reporta
      // como P2002. Sin este catch, se propagaria como un error no
      // controlado y el GlobalExceptionFilter lo convertiria en 500;
      // con el catch, se traduce al mismo 400 que el pre-chequeo no
      // concurrente ya daba, manteniendo una respuesta funcional
      // consistente sin importar si la colision ocurre antes o
      // durante la transaccion.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('El slug de Tenant ya esta en uso');
      }
      throw error;
    }
  }
}
