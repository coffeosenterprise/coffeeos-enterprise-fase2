import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { ReportingService } from './reporting.service';
import { ReportQueryDto } from './reporting.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('sales.create')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('overview')
  overview(@Query() query: ReportQueryDto) {
    return this.reportingService.overview(query);
  }
}
