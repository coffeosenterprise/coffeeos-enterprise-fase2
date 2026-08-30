import {
  Body,
  Controller,
  Get,
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
import { SalesPosService } from './sales-pos.service';
import { CreateSaleDto } from './sales-pos.dto';

@Controller('sales')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('sales.create')
export class SalesPosController {
  constructor(private readonly salesService: SalesPosService) {}

  @Get()
  recent(@Query('cashSessionId') cashSessionId: string) {
    return this.salesService.recent(cashSessionId);
  }

  @Post()
  create(
    @Req() req: Request & { user: AccessTokenPayload },
    @Body() dto: CreateSaleDto,
  ) {
    return this.salesService.create(req.user.sub, dto);
  }
}
