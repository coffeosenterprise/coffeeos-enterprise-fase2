import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { getTenantContext } from '../../common/tenant/tenant-context';
import type {
  CreateIngredientDto,
  InventoryMovementDto,
  RestockDto,
  UpdateInventoryStockDto,
  ExecuteInventoryRecipeDto,
  SaveInventoryRecipeDto,
} from './inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  list(branchId: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.inventoryStock.findMany({
        where: { branchId },
        include: { ingredient: true },
        orderBy: { ingredient: { name: 'asc' } },
      }),
    );
  }

  lowStock(branchId: string) {
    return this.prisma.withTenantContext(async (tx) => {
      const stocks = await tx.inventoryStock.findMany({
        where: { branchId },
        include: { ingredient: true },
      });
      return stocks.filter(
        (stock) => Number(stock.quantity) <= Number(stock.minQuantity),
      );
    });
  }

  recipes() {
    return this.prisma.withTenantContext((tx) =>
      tx.inventoryRecipe.findMany({
        include: {
          outputIngredient: true,
          items: { include: { ingredient: true } },
        },
        orderBy: { name: 'asc' },
      }),
    );
  }

  createRecipe(dto: SaveInventoryRecipeDto) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext(async (tx) => {
      await this.validateRecipeDefinition(tx, dto);
      const ingredient = await tx.ingredient.findFirstOrThrow({
        where: { id: dto.outputIngredientId },
      });
      const name = dto.name?.trim() || ingredient.name;
      const deductMode = dto.deductMode || 'auto_on_sale';

      const existing = await tx.inventoryRecipe.findFirst({
        where: { outputIngredientId: dto.outputIngredientId },
      });

      if (existing) {
        await tx.inventoryRecipeItem.deleteMany({ where: { recipeId: existing.id } });
        return tx.inventoryRecipe.update({
          where: { id: existing.id },
          data: {
            name,
            deductMode,
            outputQuantity: dto.outputQuantity,
            items: {
              create: dto.items.map((item) => ({
                tenantId,
                ingredientId: item.ingredientId,
                quantity: item.quantity,
              })),
            },
          },
          include: {
            outputIngredient: true,
            items: { include: { ingredient: true } },
          },
        });
      }

      return tx.inventoryRecipe.create({
        data: {
          tenantId,
          name,
          deductMode,
          outputIngredientId: dto.outputIngredientId,
          outputQuantity: dto.outputQuantity,
          items: {
            create: dto.items.map((item) => ({
              tenantId,
              ingredientId: item.ingredientId,
              quantity: item.quantity,
            })),
          },
        },
        include: {
          outputIngredient: true,
          items: { include: { ingredient: true } },
        },
      });
    });
  }

  updateRecipe(recipeId: string, dto: SaveInventoryRecipeDto) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext(async (tx) => {
      const recipe = await tx.inventoryRecipe.findFirst({
        where: { id: recipeId },
        include: { outputIngredient: true },
      });
      if (!recipe) {
        throw new NotFoundException('Receta de inventario no encontrada');
      }
      await this.validateRecipeDefinition(tx, dto);
      const name = dto.name?.trim() || recipe.outputIngredient.name;
      const deductMode = dto.deductMode || recipe.deductMode;
      await tx.inventoryRecipeItem.deleteMany({ where: { recipeId } });
      return tx.inventoryRecipe.update({
        where: { id: recipeId },
        data: {
          name,
          deductMode,
          outputIngredientId: dto.outputIngredientId,
          outputQuantity: dto.outputQuantity,
          items: {
            create: dto.items.map((item) => ({
              tenantId,
              ingredientId: item.ingredientId,
              quantity: item.quantity,
            })),
          },
        },
        include: {
          outputIngredient: true,
          items: { include: { ingredient: true } },
        },
      });
    });
  }

  deleteRecipe(recipeId: string) {
    return this.prisma.withTenantContext(async (tx) => {
      const recipe = await tx.inventoryRecipe.findFirst({
        where: { id: recipeId },
      });
      if (!recipe) {
        throw new NotFoundException('Receta de inventario no encontrada');
      }
      await tx.inventoryRecipe.delete({ where: { id: recipeId } });
      return { deleted: true };
    });
  }

  executeRecipe(
    recipeId: string,
    dto: ExecuteInventoryRecipeDto,
    actorId: string,
  ) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id: dto.branchId, deletedAt: null },
      });
      if (!branch) throw new NotFoundException('Sucursal no encontrada');

      const recipe = await tx.inventoryRecipe.findFirst({
        where: { id: recipeId },
        include: {
          outputIngredient: true,
          items: { include: { ingredient: true } },
        },
      });
      if (!recipe) {
        throw new NotFoundException('Receta de inventario no encontrada');
      }

      const ingredientIds = [
        recipe.outputIngredientId,
        ...recipe.items.map((item) => item.ingredientId),
      ];
      const stocks = await tx.inventoryStock.findMany({
        where: {
          branchId: dto.branchId,
          ingredientId: { in: ingredientIds },
        },
        include: { ingredient: true },
      });
      const stockMap = new Map(stocks.map((stock) => [stock.ingredientId, stock]));
      const batches = new Prisma.Decimal(dto.batches);
      const requirements = recipe.items.map((item) => ({
        item,
        required: new Prisma.Decimal(item.quantity).mul(batches),
      }));
      for (const requirement of requirements) {
        const stock = stockMap.get(requirement.item.ingredientId);
        if (!stock) {
          throw new BadRequestException(
            `Falta inventario para ${requirement.item.ingredient.name}`,
          );
        }
        if (new Prisma.Decimal(stock.quantity).lt(requirement.required)) {
          throw new BadRequestException(
            `Inventario insuficiente de ${stock.ingredient.name}`,
          );
        }
      }

      const outputStock = stockMap.get(recipe.outputIngredientId);
      if (!outputStock) {
        throw new BadRequestException(
          `Agrega ${recipe.outputIngredient.name} al inventario de esta sucursal antes de producir`,
        );
      }

      let productionCost = new Prisma.Decimal(0);
      for (const requirement of requirements) {
        const stock = stockMap.get(requirement.item.ingredientId)!;
        const consumedCost = requirement.required.mul(stock.averageUnitCost);
        productionCost = productionCost.plus(consumedCost);
        const updated = await tx.inventoryStock.update({
          where: { id: stock.id },
          data: { quantity: { decrement: requirement.required } },
        });
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            stockId: stock.id,
            type: 'production_input',
            quantity: requirement.required.negated(),
            balanceBefore: stock.quantity,
            balanceAfter: updated.quantity,
            unitCost: stock.averageUnitCost,
            totalCost: consumedCost,
            referenceId: recipe.id,
            actorId,
            reason: 'production',
            note: `Producción de ${recipe.outputIngredient.name}`,
          },
        });
      }

      const producedQuantity = new Prisma.Decimal(recipe.outputQuantity).mul(batches);
      const previousOutputQuantity = new Prisma.Decimal(outputStock.quantity);
      const previousOutputValue = previousOutputQuantity.mul(
        outputStock.averageUnitCost,
      );
      const nextOutputQuantity = previousOutputQuantity.plus(producedQuantity);
      const nextAverageCost = nextOutputQuantity.gt(0)
        ? previousOutputValue.plus(productionCost).div(nextOutputQuantity)
        : new Prisma.Decimal(0);
      const updatedOutput = await tx.inventoryStock.update({
        where: { id: outputStock.id },
        data: {
          quantity: nextOutputQuantity,
          averageUnitCost: nextAverageCost,
        },
        include: { ingredient: true },
      });
      await tx.inventoryMovement.create({
        data: {
          tenantId,
          stockId: outputStock.id,
          type: 'production_output',
          quantity: producedQuantity,
          balanceBefore: outputStock.quantity,
          balanceAfter: nextOutputQuantity,
          unitCost: productionCost.div(producedQuantity),
          totalCost: productionCost,
          referenceId: recipe.id,
          actorId,
          reason: 'production',
          note: `Resultado de ${recipe.name}`,
        },
      });

      return {
        recipeId: recipe.id,
        recipeName: recipe.name,
        batches,
        producedQuantity,
        productionCost,
        outputStock: updatedOutput,
      };
    });
  }

  private async validateRecipeDefinition(
    tx: Prisma.TransactionClient,
    dto: SaveInventoryRecipeDto,
  ) {
    const ingredientIds = dto.items.map((item) => item.ingredientId);
    if (ingredientIds.includes(dto.outputIngredientId)) {
      throw new BadRequestException(
        'El ingrediente producido no puede consumirse en la misma receta',
      );
    }
    if (new Set(ingredientIds).size !== ingredientIds.length) {
      throw new BadRequestException(
        'No repitas ingredientes dentro de la receta',
      );
    }
    const ingredients = await tx.ingredient.findMany({
      where: {
        id: { in: [dto.outputIngredientId, ...ingredientIds] },
        active: true,
      },
      select: { id: true },
    });
    if (ingredients.length !== ingredientIds.length + 1) {
      throw new BadRequestException(
        'Uno o más ingredientes de la receta no existen o están inactivos',
      );
    }
  }

  create(dto: CreateIngredientDto) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id: dto.branchId, deletedAt: null },
      });
      if (!branch) throw new NotFoundException('Sucursal no encontrada');

      const ingredient = await tx.ingredient.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          unit: dto.unit.trim(),
        },
      });
      const stock = await tx.inventoryStock.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          ingredientId: ingredient.id,
          quantity: dto.quantity,
          minQuantity: dto.minQuantity,
          averageUnitCost: dto.initialUnitCost ?? 0,
        },
        include: { ingredient: true },
      });
      if (dto.quantity > 0) {
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            stockId: stock.id,
            type: 'initial',
            quantity: dto.quantity,
            balanceBefore: 0,
            balanceAfter: dto.quantity,
            unitCost: dto.initialUnitCost ?? 0,
            totalCost: dto.quantity * (dto.initialUnitCost ?? 0),
            reason: 'initial',
            note: 'Existencia inicial',
          },
        });
      }
      return stock;
    });
  }

  movements(branchId: string, filters: { stockId?: string; type?: string }) {
    return this.prisma.withTenantContext((tx) =>
      tx.inventoryMovement.findMany({
        where: {
          ...(filters.stockId ? { stockId: filters.stockId } : {}),
          ...(filters.type ? { type: filters.type } : {}),
          stock: { branchId },
        },
        include: {
          stock: { include: { ingredient: true } },
          actor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  restock(stockId: string, dto: RestockDto, actorId?: string) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext(async (tx) => {
      const stock = await tx.inventoryStock.findFirst({
        where: { id: stockId },
      });
      if (!stock) {
        throw new NotFoundException('Producto de inventario no encontrado');
      }
      const previousQuantity = new Prisma.Decimal(stock.quantity);
      const previousCost = new Prisma.Decimal(stock.averageUnitCost);
      const entryUnitCost = new Prisma.Decimal(dto.unitCost ?? 0);
      const entryValue = entryUnitCost.mul(dto.quantity);
      const existingValue = previousQuantity.mul(previousCost);
      const nextQuantity = previousQuantity.plus(dto.quantity);
      const nextAverageCost = nextQuantity.gt(0)
        ? existingValue.plus(entryValue).div(nextQuantity)
        : new Prisma.Decimal(0);
      const updated = await tx.inventoryStock.update({
        where: { id: stock.id },
        data: {
          quantity: { increment: dto.quantity },
          averageUnitCost: nextAverageCost,
        },
        include: { ingredient: true },
      });
      await tx.inventoryMovement.create({
        data: {
          tenantId,
          stockId: stock.id,
          type: 'restock',
          quantity: dto.quantity,
          balanceBefore: previousQuantity,
          balanceAfter: updated.quantity,
          unitCost: entryUnitCost,
          totalCost: entryValue,
          actorId,
          reason: 'restock',
          note: dto.note?.trim() || 'Reposicion',
        },
      });
      return updated;
    });
  }

  createMovement(stockId: string, dto: InventoryMovementDto, actorId: string) {
    const { tenantId } = getTenantContext();
    const normalizedType = dto.type.trim().toLowerCase();
    const isReduction =
      normalizedType === 'out' ||
      normalizedType === 'salida' ||
      normalizedType === 'waste' ||
      normalizedType === 'merma';
    const delta = isReduction ? -dto.quantity : dto.quantity;
    return this.prisma.withTenantContext(async (tx) => {
      const stock = await tx.inventoryStock.findFirst({
        where: { id: stockId },
        include: { ingredient: true },
      });
      if (!stock) {
        throw new NotFoundException('Producto de inventario no encontrado');
      }
      const previousQuantity = new Prisma.Decimal(stock.quantity);
      const previousCost = new Prisma.Decimal(stock.averageUnitCost);
      const movementUnitCost = new Prisma.Decimal(dto.unitCost ?? 0);
      const nextQuantity = previousQuantity.plus(delta);
      if (nextQuantity.lt(0)) {
        throw new BadRequestException('La existencia no puede quedar negativa');
      }
      const shouldRecalculateCost =
        !isReduction && delta > 0 && (dto.unitCost ?? 0) > 0;
      const nextAverageCost = shouldRecalculateCost
        ? previousQuantity
            .mul(previousCost)
            .plus(movementUnitCost.mul(delta))
            .div(nextQuantity)
        : previousCost;
      const updated = await tx.inventoryStock.update({
        where: { id: stock.id },
        data: {
          quantity: nextQuantity,
          averageUnitCost: nextAverageCost,
        },
        include: { ingredient: true },
      });
      return tx.inventoryMovement.create({
        data: {
          tenantId,
          stockId: stock.id,
          type: normalizedType || 'adjustment',
          quantity: delta,
          balanceBefore: stock.quantity,
          balanceAfter: updated.quantity,
          unitCost: movementUnitCost,
          totalCost: movementUnitCost.mul(Math.abs(delta)),
          actorId,
          reason: dto.reason?.trim() || normalizedType,
          note: dto.note?.trim() || null,
        },
        include: { stock: { include: { ingredient: true } } },
      });
    });
  }

  update(stockId: string, dto: UpdateInventoryStockDto, actorId?: string) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext(async (tx) => {
      const stock = await tx.inventoryStock.findFirst({
        where: { id: stockId },
        include: { ingredient: true },
      });
      if (!stock) {
        throw new NotFoundException('Producto de inventario no encontrado');
      }

      await tx.ingredient.update({
        where: { id: stock.ingredientId },
        data: {
          name: dto.name.trim(),
          unit: dto.unit.trim(),
        },
      });

      const updated = await tx.inventoryStock.update({
        where: { id: stock.id },
        data: {
          quantity: dto.quantity,
          minQuantity: dto.minQuantity,
        },
        include: { ingredient: true },
      });

      const previousQuantity = Number(stock.quantity);
      const difference = dto.quantity - previousQuantity;
      if (difference !== 0) {
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            stockId: stock.id,
            type: 'adjustment',
            quantity: difference,
            balanceBefore: previousQuantity,
            balanceAfter: updated.quantity,
            actorId,
            reason: 'adjustment',
            note: 'Correccion manual de existencia',
          },
        });
      }

      return updated;
    });
  }
}
