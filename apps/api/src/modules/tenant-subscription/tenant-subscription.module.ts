import { Module } from '@nestjs/common';
import { TenantsController } from './presentation/tenants.controller';
import { TenantService } from './application/tenant.service';
import { FeatureFlagService } from './application/feature-flag.service';
import { TenantRepository } from './infrastructure/tenant.repository';
import { FeatureFlagRepository } from './infrastructure/feature-flag.repository';

/**
 * Bounded Context: Tenant & Subscription Management
 * Fase 1 (Libro 05, 10.2).
 *
 * Fase 1 v1.3, correccion #1: ya NO importa IdentityAccessModule --
 * el bootstrap del Owner (que si necesitaba Identity) se extrajo a
 * TenantProvisioningModule. Este modulo queda limpio: solo se exporta
 * TenantRepository, que Identity SI necesita (login/reset por slug) --
 * esa es la unica relacion restante entre ambos, y es unidireccional
 * (Identity -> Tenant, nunca al reves), por lo que no hace falta
 * forwardRef(). Ver ADR-021.
 */
@Module({
  controllers: [TenantsController],
  providers: [TenantService, FeatureFlagService, TenantRepository, FeatureFlagRepository],
  exports: [TenantRepository],
})
export class TenantSubscriptionModule {}
