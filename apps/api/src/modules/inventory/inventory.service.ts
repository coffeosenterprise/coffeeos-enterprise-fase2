import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { getTenantContext } from '../../common/tenant/tenant-context';
import type {
  CreateIngredientDto,
  InventoryMovementDto,
  RestockDto,
  UpdateInventoryStockDto,
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
      const previousQuantity = Number(stock.quantity);
      const updated = await tx.inventoryStock.update({
        where: { id: stock.id },
        data: { quantity: { increment: dto.quantity } },
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
    const delta =
      normalizedType === 'out' ||
      normalizedType === 'salida' ||
      normalizedType === 'waste' ||
      normalizedType === 'merma'
        ? -dto.quantity
        : dto.quantity;
    return this.prisma.withTenantContext(async (tx) => {
      const stock = await tx.inventoryStock.findFirst({
        where: { id: stockId },
        include: { ingredient: true },
      });
      if (!stock) {
        throw new NotFoundException('Producto de inventario no encontrado');
      }
      const nextQuantity = Number(stock.quantity) + delta;
      if (nextQuantity < 0) {
        throw new BadRequestException('La existencia no puede quedar negativa');
      }
      const updated = await tx.inventoryStock.update({
        where: { id: stock.id },
        data: { quantity: nextQuantity },
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
