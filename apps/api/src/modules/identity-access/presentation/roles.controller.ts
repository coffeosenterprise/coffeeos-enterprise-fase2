import { Controller, Get, UseGuards } from '@nestjs/common';
import { RoleRepository } from '../infrastructure/role.repository';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/auth/permissions.guard';
import { RequirePermissions } from '../../../common/auth/permissions.decorator';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly roleRepository: RoleRepository) {}

  @Get()
  @RequirePermissions('roles.manage')
  list() {
    return this.roleRepository.list();
  }
}
