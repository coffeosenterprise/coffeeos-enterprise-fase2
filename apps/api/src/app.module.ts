import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { TenantContextInterceptor } from './common/tenant/tenant-context.interceptor';
import { DatabaseModule } from './common/database/database.module';
import { HealthModule } from './common/health/health.module';
import { ObservabilityModule } from './common/observability/observability.module';
import { AuditModule } from './common/audit/audit.module';
import { EmailModule } from './common/email/email.module';

import { IdentityAccessModule } from './modules/identity-access/identity-access.module';
import { TenantSubscriptionModule } from './modules/tenant-subscription/tenant-subscription.module';
import { TenantProvisioningModule } from './modules/tenant-provisioning/tenant-provisioning.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { SalesPosModule } from './modules/sales-pos/sales-pos.module';
import { CashManagementModule } from './modules/cash-management/cash-management.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { ProductionModule } from './modules/production/production.module';
import { KitchenDisplayModule } from './modules/kitchen-display/kitchen-display.module';
import { CrmLoyaltyModule } from './modules/crm-loyalty/crm-loyalty.module';
import { ReportingModule } from './modules/reporting/reporting.module';

/**
 * AppModule -- Monolito Modular (ADR-001).
 *
 * Fase 1 (Libro 05, seccion 10): Identity, Tenant, Organization,
 * Audit y Observability tienen implementacion real.
 *
 * TenantProvisioningModule (Fase 1 v1.3) es una capa de orquestacion,
 * no un Bounded Context: coordina Identity y Tenant unicamente para
 * el alta atomica de un Tenant nuevo, sin que ninguno de los dos
 * dependa del otro (ver ADR-021).
 *
 * Catalog, Sales/POS, Cash, Inventory, Purchasing, Production,
 * KitchenDisplay, CrmLoyalty y Reporting permanecen como modulos
 * vacios (Fase 0) -- pertenecen a fases posteriores (Libro 05,
 * secciones 11-13) y no se tocan en esta entrega.
 *
 * Integrations API (Bounded Context #13) sigue sin registrarse:
 * diferido a P1 / post-MVP (G0-007).
 */
@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    ObservabilityModule,
    AuditModule,
    EmailModule,
    IdentityAccessModule,
    TenantSubscriptionModule,
    TenantProvisioningModule,
    OrganizationModule,
    CatalogModule,
    SalesPosModule,
    CashManagementModule,
    InventoryModule,
    PurchasingModule,
    ProductionModule,
    KitchenDisplayModule,
    CrmLoyaltyModule,
    ReportingModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('{*path}');
  }
}
