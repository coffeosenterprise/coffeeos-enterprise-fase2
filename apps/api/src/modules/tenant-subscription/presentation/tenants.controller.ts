import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { TenantService } from '../application/tenant.service';
import { FeatureFlagService } from '../application/feature-flag.service';
import { ConfigurePlanDto, SetFeatureFlagDto } from './dto/tenant.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/auth/permissions.guard';
import { RequirePermissions } from '../../../common/auth/permissions.decorator';
import type { AccessTokenPayload } from '../../../common/auth/jwt.types';

/**
 * Fase 1 v1.1, correccion #5: estos endpoints son autoservicio --
 * SIEMPRE operan sobre `req.user.tenantId` (el Tenant del token),
 * nunca sobre un `:id` de la URL.
 *
 * Fase 1 v1.3, correccion #1: `POST /tenants` (alta + bootstrap del
 * Owner) se movio a TenantProvisioningController -- ese endpoint
 * necesita Identity & Access, y este modulo ya no depende de Identity
 * en absoluto (ver ADR-021). Este controlador solo cubre autoservicio
 * sobre un Tenant que YA existe y ya tiene un usuario autenticado.
 *
 * La administracion de PLATAFORMA sigue fuera de esta fase (ADR-020).
 */
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly featureFlagService: FeatureFlagService,
  ) {}

  @Patch('me/activate')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('tenant.manage')
  activateOwn(@Req() req: Request & { user: AccessTokenPayload }) {
    return this.tenantService.activateOwn(req.user.tenantId);
  }

  @Patch('me/suspend')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('tenant.manage')
  suspendOwn(@Req() req: Request & { user: AccessTokenPayload }) {
    return this.tenantService.suspendOwn(req.user.tenantId);
  }

  @Patch('me/plan')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('tenant.manage')
  configurePlanOwn(
    @Body() dto: ConfigurePlanDto,
    @Req() req: Request & { user: AccessTokenPayload },
  ) {
    return this.tenantService.configurePlanOwn(req.user.tenantId, dto.plan);
  }

  @Get('me/limits')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('tenant.manage')
  limitsOwn(@Req() req: Request & { user: AccessTokenPayload }) {
    return this.tenantService.limitsOwn(req.user.tenantId);
  }

  @Get('me/feature-flags')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('tenant.manage')
  listFlags() {
    return this.featureFlagService.list();
  }

  @Post('me/feature-flags')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('tenant.manage')
  setFlag(@Body() dto: SetFeatureFlagDto) {
    return this.featureFlagService.set(dto.key, dto.enabled);
  }
}
