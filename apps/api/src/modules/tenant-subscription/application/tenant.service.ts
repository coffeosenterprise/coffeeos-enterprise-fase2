import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantRepository } from '../infrastructure/tenant.repository';
import { resolvePlanLimits } from './plan-limits';

/**
 * Tenant & Subscription Management (Libro 05, 10.2).
 *
 * Fase 1 v1.3: el alta de Tenant (que requiere Identity & Access para
 * el bootstrap del Owner) se movio a TenantProvisioningService --
 * este servicio ya NO depende de Identity en absoluto (correccion #1).
 * Solo cubre autoservicio sobre un Tenant que ya existe.
 */
@Injectable()
export class TenantService {
  constructor(private readonly tenantRepository: TenantRepository) {}

  /** Autoservicio: solo sobre el propio Tenant del que llama (correccion #5, v1.1). */
  async activateOwn(tenantId: string) {
    return this.tenantRepository.updateStatus(tenantId, 'active');
  }

  async suspendOwn(tenantId: string) {
    return this.tenantRepository.updateStatus(tenantId, 'suspended');
  }

  async configurePlanOwn(tenantId: string, plan: string) {
    return this.tenantRepository.updatePlan(tenantId, plan);
  }

  async limitsOwn(tenantId: string) {
    const tenant = await this.getOrThrow(tenantId);
    return resolvePlanLimits(
      tenant.plan,
      tenant.customLimits as Record<string, number> | null,
    );
  }

  private async getOrThrow(tenantId: string) {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    return tenant;
  }
}
