import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { InventoryService } from './inventory.service';
import {
  CreateIngredientDto,
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

  @Post('ingredients')
  create(@Body() dto: CreateIngredientDto) {
    return this.inventoryService.create(dto);
  }

  @Post('stocks/:stockId/restock')
  restock(@Param('stockId') stockId: string, @Body() dto: RestockDto) {
    return this.inventoryService.restock(stockId, dto);
  }

  @Patch('stocks/:stockId')
  update(
    @Param('stockId') stockId: string,
    @Body() dto: UpdateInventoryStockDto,
  ) {
    return this.inventoryService.update(stockId, dto);
  }
}
