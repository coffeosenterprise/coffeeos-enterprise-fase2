import {
  Body,
  Controller,
  Delete,
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
  ExecuteInventoryRecipeDto,
  SaveInventoryRecipeDto,
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

  @Get('recipes')
  recipes() {
    return this.inventoryService.recipes();
  }

  @Post('recipes')
  createRecipe(@Body() dto: SaveInventoryRecipeDto) {
    return this.inventoryService.createRecipe(dto);
  }

  @Patch('recipes/:recipeId')
  updateRecipe(
    @Param('recipeId') recipeId: string,
    @Body() dto: SaveInventoryRecipeDto,
  ) {
    return this.inventoryService.updateRecipe(recipeId, dto);
  }

  @Delete('recipes/:recipeId')
  deleteRecipe(@Param('recipeId') recipeId: string) {
    return this.inventoryService.deleteRecipe(recipeId);
  }

  @Post('recipes/:recipeId/execute')
  executeRecipe(
    @Req() req: Request & { user: AccessTokenPayload },
    @Param('recipeId') recipeId: string,
    @Body() dto: ExecuteInventoryRecipeDto,
  ) {
    return this.inventoryService.executeRecipe(recipeId, dto, req.user.sub);
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
