import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { OrganizationService } from '../application/organization.service';
import {
  CreateCompanyDto,
  CreateBranchDto,
  CreateTerminalDto,
  AssignUserDto,
} from './dto/organization.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/auth/permissions.guard';
import { RequirePermissions } from '../../../common/auth/permissions.decorator';
import type { AccessTokenPayload } from '../../../common/auth/jwt.types';

@Controller('organization')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get('companies')
  listCompanies() {
    return this.organizationService.listCompanies();
  }

  @Get('companies/:companyId/branches')
  listBranches(@Param('companyId') companyId: string) {
    return this.organizationService.listBranches(companyId);
  }

  @Get('branches/:branchId/terminals')
  listTerminals(@Param('branchId') branchId: string) {
    return this.organizationService.listTerminals(branchId);
  }

  @Post('companies')
  @RequirePermissions('organization.manage')
  createCompany(
    @Body() dto: CreateCompanyDto,
    @Req() req: Request & { user: AccessTokenPayload },
  ) {
    return this.organizationService.createCompany(req.user.sub, dto);
  }

  @Post('companies/:companyId/branches')
  @RequirePermissions('organization.manage')
  createBranch(
    @Param('companyId') companyId: string,
    @Body() dto: CreateBranchDto,
    @Req() req: Request & { user: AccessTokenPayload },
  ) {
    return this.organizationService.createBranch(req.user.sub, companyId, dto);
  }

  @Post('branches/:branchId/terminals')
  @RequirePermissions('organization.manage')
  createTerminal(
    @Param('branchId') branchId: string,
    @Body() dto: CreateTerminalDto,
    @Req() req: Request & { user: AccessTokenPayload },
  ) {
    return this.organizationService.createTerminal(req.user.sub, branchId, dto);
  }

  @Post('branches/:branchId/users')
  @RequirePermissions('organization.manage')
  assignUser(
    @Param('branchId') branchId: string,
    @Body() dto: AssignUserDto,
    @Req() req: Request & { user: AccessTokenPayload },
  ) {
    return this.organizationService.assignUserToBranch(
      req.user.sub,
      branchId,
      dto.userId,
    );
  }
}
