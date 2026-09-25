import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AccessTokenPayload } from '../../common/auth/jwt.types';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { InventoryService } from './inventory.service';
import {
  CreateIngredientDto,
  InventoryMovementDto,
  RestockDto,
  UpdateInventoryStockDto,
} from './inventory.dto';

@Controller('inventory')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('inventory.manage')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  list(@Query('branchId') branchId: string) {
    return this.inventoryService.list(branchId);
  }

  @Get('low-stock')
  lowStock(@Query('branchId') branchId: string) {
    return this.inventoryService.lowStock(branchId);
  }

  @Get('movements')
  movements(
    @Query('branchId') branchId: string,
    @Query('stockId') stockId?: string,
    @Query('type') type?: string,
  ) {
    return this.inventoryService.movements(branchId, { stockId, type });
  }

  @Post('ingredients')
  create(@Body() dto: CreateIngredientDto) {
    return this.inventoryService.create(dto);
  }

  @Post('stocks/:stockId/restock')
  restock(
    @Req() req: Request & { user: AccessTokenPayload },
    @Param('stockId') stockId: string,
    @Body() dto: RestockDto,
  ) {
    return this.inventoryService.restock(stockId, dto, req.user.sub);
  }

  @Post('stocks/:stockId/movements')
  movement(
    @Req() req: Request & { user: AccessTokenPayload },
    @Param('stockId') stockId: string,
    @Body() dto: InventoryMovementDto,
  ) {
    return this.inventoryService.createMovement(stockId, dto, req.user.sub);
  }

  @Patch('stocks/:stockId')
  update(
    @Req() req: Request & { user: AccessTokenPayload },
    @Param('stockId') stockId: string,
    @Body() dto: UpdateInventoryStockDto,
  ) {
    return this.inventoryService.update(stockId, dto, req.user.sub);
  }
}
