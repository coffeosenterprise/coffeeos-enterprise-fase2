import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import type { AccessTokenPayload } from '../../common/auth/jwt.types';
import { CashManagementService } from './cash-management.service';
import {
  CloseCashSessionDto,
  OpenCashSessionDto,
} from './cash-management.dto';

@Controller('cash')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('cash.manage')
export class CashManagementController {
  constructor(private readonly cashService: CashManagementService) {}

  @Get('current')
  current(@Query('terminalId') terminalId: string) {
    return this.cashService.current(terminalId);
  }

  @Get('history')
  history(
    @Query('branchId') branchId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.cashService.history(branchId, limit ? Number(limit) : undefined);
  }

  @Post('open')
  open(
    @Req() req: Request & { user: AccessTokenPayload },
    @Body() dto: OpenCashSessionDto,
  ) {
    return this.cashService.open(req.user.sub, dto);
  }

  @Post(':sessionId/close')
  close(
    @Req() req: Request & { user: AccessTokenPayload },
    @Param('sessionId') sessionId: string,
    @Body() dto: CloseCashSessionDto,
  ) {
    return this.cashService.close(req.user.sub, sessionId, dto);
  }
}
