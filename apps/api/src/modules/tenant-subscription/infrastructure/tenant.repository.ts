import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';

/**
 * TenantRepository permite resolver el slug antes del login mediante
 * la politica SELECT especifica de `tenants`. Las lecturas y
 * escrituras autenticadas pasan por withTenantContext(), igual que el
 * resto de tablas protegidas por RLS.
 */
@Injectable()
export class TenantRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.tenant.findFirst({
        where: { id, deletedAt: null },
      }),
    );
  }

  findBySlug(slug: string) {
    return this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
    });
  }

  updateStatus(id: string, status: 'active' | 'suspended') {
    return this.prisma.withTenantContext((tx) =>
      tx.tenant.update({
        where: { id },
        data: { status },
      }),
    );
  }

  updatePlan(id: string, plan: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.tenant.update({
        where: { id },
        data: { plan },
      }),
    );
  }

  updateCustomLimits(id: string, customLimits: Record<string, unknown>) {
    return this.prisma.withTenantContext((tx) =>
      tx.tenant.update({
        where: { id },
        data: { customLimits: customLimits as never },
      }),
    );
  }
}
