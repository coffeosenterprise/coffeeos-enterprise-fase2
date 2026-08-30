import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';

/**
 * TenantRepository es especial: crear un Tenant ocurre ANTES de que
 * exista un TenantContext (todavia no hay tenant_id que fijar). Por
 * eso usa PrismaClient directamente para el alta -- es la unica
 * excepcion documentada a la regla de "siempre pasar por
 * withTenantContext()", precisamente porque tenants no tiene RLS
 * (es la tabla raiz, no pertenece a ningun tenant).
 */
@Injectable()
export class TenantRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { name: string; plan: string; slug: string }) {
    return (this.prisma as unknown as PrismaClient).tenant.create({ data });
  }

  findById(id: string) {
    return (this.prisma as unknown as PrismaClient).tenant.findFirst({
      where: { id, deletedAt: null },
    });
  }

  findBySlug(slug: string) {
    return (this.prisma as unknown as PrismaClient).tenant.findFirst({
      where: { slug, deletedAt: null },
    });
  }

  updateStatus(id: string, status: 'active' | 'suspended') {
    return (this.prisma as unknown as PrismaClient).tenant.update({
      where: { id },
      data: { status },
    });
  }

  updatePlan(id: string, plan: string) {
    return (this.prisma as unknown as PrismaClient).tenant.update({
      where: { id },
      data: { plan },
    });
  }

  updateCustomLimits(id: string, customLimits: Record<string, unknown>) {
    return (this.prisma as unknown as PrismaClient).tenant.update({
      where: { id },
      data: { customLimits: customLimits as never },
    });
  }
}
