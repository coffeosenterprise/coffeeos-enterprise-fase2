import { Module } from '@nestjs/common';
import { IdentityAccessModule } from '../identity-access/identity-access.module';
import { TenantSubscriptionModule } from '../tenant-subscription/tenant-subscription.module';
import { TenantProvisioningController } from './presentation/tenant-provisioning.controller';
import { TenantProvisioningService } from './application/tenant-provisioning.service';

/**
 * Capa de orquestacion (Fase 1 v1.3, correccion #1) -- NO es un
 * Bounded Context. Importa Identity y Tenant en una unica direccion;
 * ninguno de los dos importa de vuelta a este modulo ni entre si.
 * Ver ADR-021.
 */
@Module({
  imports: [IdentityAccessModule, TenantSubscriptionModule],
  controllers: [TenantProvisioningController],
  providers: [TenantProvisioningService],
})
export class TenantProvisioningModule {}
