import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { UserRepository } from '../infrastructure/user.repository';
import { RoleRepository } from '../infrastructure/role.repository';
import { TenantRepository } from '../../tenant-subscription/infrastructure/tenant.repository';
import { PrismaService } from '../../../common/database/prisma.service';
import { PasswordHasher } from '../../../common/security/password-hasher';
import { AuditService } from '../../../common/audit/audit.service';
import {
  decodeCompositeToken,
  encodeCompositeToken,
  getTenantContext,
  runWithTenantContext,
} from '../../../common/tenant/tenant-context';

const INVITATION_TTL_DAYS = 7;
const PASSWORD_RESET_TTL_HOURS = 1;

/**
 * Ciclo de vida de usuarios (Libro 05, 10.2).
 *
 * Fase 1 v1.1:
 *  - invite() emite un token compuesto (tenantId.secreto) en vez de
 *    un token plano -- necesario para que activate() pueda resolver
 *    el Tenant sin tener TenantContext previo (correccion #4).
 *  - activate() es completamente transaccional: crear usuario,
 *    asignar rol, marcar invitacion aceptada y auditar ocurren en
 *    una unica transaccion (correccion #7). Si algo falla a mitad,
 *    no queda un usuario huerfano ni una invitacion en estado
 *    inconsistente.
 *  - requestPasswordReset()/resetPassword() siguen el mismo patron.
 */
@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
    private readonly auditService: AuditService,
  ) {}

  /** Requiere TenantContext activo (llamado desde un endpoint autenticado). */
  async invite(
    email: string,
    roleId: string,
    invitedByUserId: string,
  ): Promise<{ invitationToken: string }> {
    const role = await this.roleRepository.findById(roleId);
    if (!role) throw new BadRequestException('Rol invalido para este tenant');

    const { tenantId } = getTenantContext();
    const secret = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(secret).digest('hex');

    await this.prisma.withTenantContext((tx) =>
      tx.invitation.create({
        data: {
          tenantId,
          email,
          roleId,
          tokenHash,
          invitedByUserId,
          expiresAt: new Date(
            Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
          ),
        },
      }),
    );

    await this.auditService.record({
      actorId: invitedByUserId,
      action: 'USER_INVITED',
      entity: 'invitation',
      payload: { email, roleId },
    });

    // La entrega real del token (correo) es responsabilidad de
    // Notifications -- fuera del alcance de Fase 1. El controlador
    // decide si expone este token en la respuesta HTTP segun el
    // ambiente (correccion #11) -- este servicio siempre lo retorna
    // para que las pruebas puedan usarlo.
    return { invitationToken: encodeCompositeToken(tenantId, secret) };
  }

  /** NO requiere TenantContext previo: lo resuelve del propio token. */
  async activate(
    compositeToken: string,
    data: { firstName: string; lastName: string; password: string },
  ) {
    let tenantId: string;
    let secret: string;
    try {
      ({ tenantId, secret } = decodeCompositeToken(compositeToken));
    } catch {
      throw new BadRequestException('Invitacion invalida o expirada');
    }

    const tokenHash = createHash('sha256').update(secret).digest('hex');
    const passwordHash = await this.passwordHasher.hash(data.password);

    return runWithTenantContext(
      { tenantId, correlationId: randomUUID() },
      () =>
        this.prisma.withTenantContext(async (tx) => {
          const invitation = await tx.invitation.findFirst({
            where: {
              tokenHash,
              status: 'pending',
              expiresAt: { gt: new Date() },
            },
          });

          if (!invitation) {
            throw new BadRequestException('Invitacion invalida o expirada');
          }

          const user = await tx.user.create({
            data: {
              tenantId,
              email: invitation.email,
              firstName: data.firstName,
              lastName: data.lastName,
              passwordHash,
              status: 'active',
            },
          });

          await tx.userRole.create({
            data: { tenantId, userId: user.id, roleId: invitation.roleId },
          });

          await tx.invitation.update({
            where: { id: invitation.id },
            data: { status: 'accepted', acceptedAt: new Date() },
          });

          await this.auditService.recordWithinTransaction(tx, tenantId, {
            actorId: user.id,
            action: 'USER_ACTIVATED',
            entity: 'user',
            entityId: user.id,
          });

          return { userId: user.id };
        }),
    );
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user || !user.passwordHash) throw new NotFoundException('Usuario no encontrado');

    const valid = await this.passwordHasher.verify(
      user.passwordHash,
      currentPassword,
    );
    if (!valid) throw new BadRequestException('Contrasena actual incorrecta');

    const newHash = await this.passwordHasher.hash(newPassword);
    await this.userRepository.updatePassword(userId, newHash);

    await this.auditService.record({
      actorId: userId,
      action: 'PASSWORD_CHANGED',
      entity: 'user',
      entityId: userId,
    });
  }

  /** NO requiere TenantContext previo: lo resuelve por tenantSlug. */
  async requestPasswordReset(
    tenantSlug: string,
    email: string,
  ): Promise<{ resetToken: string } | null> {
    const tenant = await this.tenantRepository.findBySlug(tenantSlug);
    if (!tenant) return null; // no revelar si el tenant existe

    return runWithTenantContext(
      { tenantId: tenant.id, correlationId: randomUUID() },
      async () => {
        const user = await this.userRepository.findByEmail(email);
        if (!user) return null; // no revelar si el correo existe

        const secret = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(secret).digest('hex');

        await this.prisma.withTenantContext((tx) =>
          tx.passwordResetToken.create({
            data: {
              tenantId: tenant.id,
              userId: user.id,
              tokenHash,
              expiresAt: new Date(
                Date.now() + PASSWORD_RESET_TTL_HOURS * 60 * 60 * 1000,
              ),
            },
          }),
        );

        return { resetToken: encodeCompositeToken(tenant.id, secret) };
      },
    );
  }

  /** NO requiere TenantContext previo: lo resuelve del propio token. */
  async resetPassword(compositeToken: string, newPassword: string): Promise<void> {
    let tenantId: string;
    let secret: string;
    try {
      ({ tenantId, secret } = decodeCompositeToken(compositeToken));
    } catch {
      throw new BadRequestException('Token de recuperacion invalido o expirado');
    }

    const tokenHash = createHash('sha256').update(secret).digest('hex');

    await runWithTenantContext(
      { tenantId, correlationId: randomUUID() },
      () =>
        this.prisma.withTenantContext(async (tx) => {
          const resetRequest = await tx.passwordResetToken.findFirst({
            where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
          });

          if (!resetRequest) {
            throw new BadRequestException(
              'Token de recuperacion invalido o expirado',
            );
          }

          const newHash = await this.passwordHasher.hash(newPassword);

          await tx.user.update({
            where: { id: resetRequest.userId },
            data: { passwordHash: newHash },
          });

          await tx.passwordResetToken.update({
            where: { id: resetRequest.id },
            data: { usedAt: new Date() },
          });

          await this.auditService.recordWithinTransaction(tx, tenantId, {
            actorId: resetRequest.userId,
            action: 'PASSWORD_RESET',
            entity: 'user',
            entityId: resetRequest.userId,
          });
        }),
    );
  }

  async block(userId: string, actorId: string): Promise<void> {
    await this.userRepository.block(userId);
    await this.auditService.record({
      actorId,
      action: 'USER_BLOCKED',
      entity: 'user',
      entityId: userId,
    });
  }
}
