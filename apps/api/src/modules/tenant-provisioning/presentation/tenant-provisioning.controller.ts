import { Body, Controller, Post } from '@nestjs/common';
import { TenantProvisioningService } from '../application/tenant-provisioning.service';
import { CreateTenantDto } from './dto/create-tenant.dto';

@Controller('tenants')
export class TenantProvisioningController {
  constructor(private readonly provisioningService: TenantProvisioningService) {}

  // Sin guard: alta de un Tenant nuevo -- todavia no existe usuario
  // autenticado. Crea el Tenant Y su usuario OWNER inicial en la
  // misma operacion atomica.
  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.provisioningService.create(dto);
  }
}
