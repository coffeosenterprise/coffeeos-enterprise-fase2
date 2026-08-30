import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { getTenantContext } from '../../../common/tenant/tenant-context';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.user.findFirst({
        where: { email, deletedAt: null },
        include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
      }),
    );
  }

  findById(id: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.user.findFirst({
        where: { id, deletedAt: null },
        include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
      }),
    );
  }

  createInvited(data: { email: string; firstName: string; lastName: string }) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext((tx) =>
      tx.user.create({
        data: { tenantId, ...data, status: 'invited' },
      }),
    );
  }

  activate(userId: string, data: { firstName: string; lastName: string; passwordHash: string }) {
    return this.prisma.withTenantContext((tx) =>
      tx.user.update({
        where: { id: userId },
        data: { ...data, status: 'active' },
      }),
    );
  }

  assignRole(userId: string, roleId: string) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext((tx) =>
      tx.userRole.create({ data: { tenantId, userId, roleId } }),
    );
  }

  registerFailedLogin(userId: string, failedAttempts: number, lockedUntil: Date | null) {
    return this.prisma.withTenantContext((tx) =>
      tx.user.update({
        where: { id: userId },
        data: { failedLoginAttempts: failedAttempts, lockedUntil },
      }),
    );
  }

  registerSuccessfulLogin(userId: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.user.update({
        where: { id: userId },
        data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
      }),
    );
  }

  updatePassword(userId: string, passwordHash: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.user.update({ where: { id: userId }, data: { passwordHash } }),
    );
  }

  block(userId: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.user.update({ where: { id: userId }, data: { status: 'blocked' } }),
    );
  }
}
