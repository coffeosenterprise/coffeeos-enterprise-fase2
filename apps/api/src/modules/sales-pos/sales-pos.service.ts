import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { getTenantContext } from '../../common/tenant/tenant-context';
import type { CreateSaleDto } from './sales-pos.dto';

@Injectable()
export class SalesPosService {
  constructor(private readonly prisma: PrismaService) {}

  recent(cashSessionId: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.sale.findMany({
        where: { cashSessionId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { items: { include: { modifiers: true } } },
      }),
    );
  }

  summary(cashSessionId: string) {
    return this.prisma.withTenantContext(async (tx) => {
      const sales = await tx.sale.findMany({
        where: { cashSessionId, status: 'completed' },
        select: { total: true, paymentMethod: true },
      });
      const totals = { total: 0, cash: 0, card: 0, transfer: 0 };
      for (const sale of sales) {
        const amount = Number(sale.total);
        totals.total += amount;
        if (sale.paymentMethod === 'card') totals.card += amount;
        else if (sale.paymentMethod === 'transfer') totals.transfer += amount;
        else totals.cash += amount;
      }
      return {
        saleCount: sales.length,
        total: totals.total.toFixed(2),
        cash: totals.cash.toFixed(2),
        card: totals.card.toFixed(2),
        transfer: totals.transfer.toFixed(2),
      };
    });
  }

  create(cashierId: string, dto: CreateSaleDto) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext(async (tx) => {
      const session = await tx.cashSession.findFirst({
        where: {
          id: dto.cashSessionId,
          branchId: dto.branchId,
          terminalId: dto.terminalId,
          status: 'open',
        },
      });
      if (!session) {
        throw new BadRequestException(
          'Debes abrir la caja de esta terminal antes de vender',
        );
      }

      const productIds = [...new Set(dto.items.map((item) => item.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, active: true },
        include: {
          ingredients: true,
          modifierGroups: {
            where: { options: { some: { active: true } } },
            include: {
              options: {
                where: { active: true },
                include: { ingredients: true },
              },
            },
          },
        },
      });
      if (products.length !== productIds.length) {
        throw new NotFoundException('Uno o mas productos no existen');
      }
      const productMap = new Map(products.map((product) => [product.id, product]));
      const consumption = new Map<string, Prisma.Decimal>();
      const preparedItems: {
        product: (typeof products)[number];
        quantity: number;
        options: (typeof products)[number]['modifierGroups'][number]['options'];
        unitPrice: Prisma.Decimal;
        subtotal: Prisma.Decimal;
      }[] = [];

      let total = new Prisma.Decimal(0);
      for (const requested of dto.items) {
        const product = productMap.get(requested.productId);
        if (!product) throw new NotFoundException('Producto no encontrado');
        const selectedIds = new Set(requested.modifierOptionIds);
        if (selectedIds.size !== requested.modifierOptionIds.length) {
          throw new BadRequestException('No puedes repetir el mismo extra');
        }
        const selectedOptions = product.modifierGroups.flatMap((group) =>
          group.options.filter((option) => selectedIds.has(option.id)),
        );
        if (selectedOptions.length !== selectedIds.size) {
          throw new BadRequestException(
            `Una opcion seleccionada no pertenece a ${product.name}`,
          );
        }
        for (const group of product.modifierGroups) {
          const count = group.options.filter((option) =>
            selectedIds.has(option.id),
          ).length;
          if (count < group.minSelections || count > group.maxSelections) {
            throw new BadRequestException(
              `${product.name}: selecciona entre ${group.minSelections} y ${group.maxSelections} opciones de ${group.name}`,
            );
          }
        }

        const extras = selectedOptions.reduce(
          (sum, option) => sum.plus(option.priceDelta),
          new Prisma.Decimal(0),
        );
        const unitPrice = product.price.plus(extras);
        const subtotal = unitPrice.mul(requested.quantity);
        total = total.plus(subtotal);
        preparedItems.push({
          product,
          quantity: requested.quantity,
          options: selectedOptions,
          unitPrice,
          subtotal,
        });

        const addConsumption = (
          ingredientId: string,
          quantity: Prisma.Decimal,
        ) => {
          const current = consumption.get(ingredientId) ?? new Prisma.Decimal(0);
          consumption.set(ingredientId, current.plus(quantity));
        };
        for (const recipe of product.ingredients) {
          addConsumption(
            recipe.ingredientId,
            recipe.quantity.mul(requested.quantity),
          );
        }
        for (const option of selectedOptions) {
          for (const recipe of option.ingredients) {
            addConsumption(
              recipe.ingredientId,
              recipe.quantity.mul(requested.quantity),
            );
          }
        }
      }

      const cashReceived = new Prisma.Decimal(
        dto.paymentMethod === 'cash' ? dto.cashReceived : 0,
      );
      if (dto.paymentMethod === 'cash' && cashReceived.lessThan(total)) {
        throw new BadRequestException(
          `Efectivo insuficiente. Total: $${total.toFixed(2)}`,
        );
      }

      const stocks = await tx.inventoryStock.findMany({
        where: {
          branchId: dto.branchId,
          ingredientId: { in: [...consumption.keys()] },
        },
        include: { ingredient: true },
      });
      const stockMap = new Map(stocks.map((stock) => [stock.ingredientId, stock]));
      for (const [ingredientId, required] of consumption) {
        const stock = stockMap.get(ingredientId);
        if (!stock) {
          throw new ConflictException(
            'Falta configurar inventario para un ingrediente de la receta',
          );
        }
        const updated = await tx.inventoryStock.updateMany({
          where: { id: stock.id, quantity: { gte: required } },
          data: { quantity: { decrement: required } },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            `Inventario insuficiente de ${stock.ingredient.name}`,
          );
        }
        const current = await tx.inventoryStock.findUniqueOrThrow({
          where: { id: stock.id },
        });
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            stockId: stock.id,
            type: 'sale',
            quantity: required.negated(),
            balanceAfter: current.quantity,
            note: 'Consumo por venta',
          },
        });
      }

      const sale = await tx.sale.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          terminalId: dto.terminalId,
          cashSessionId: dto.cashSessionId,
          cashierId,
          subtotal: total,
          total,
          cashReceived,
          changeAmount:
            dto.paymentMethod === 'cash'
              ? cashReceived.minus(total)
              : new Prisma.Decimal(0),
          paymentMethod: dto.paymentMethod,
        },
      });

      for (const item of preparedItems) {
        const saleItem = await tx.saleItem.create({
          data: {
            tenantId,
            saleId: sale.id,
            productId: item.product.id,
            productName: item.product.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            subtotal: item.subtotal,
          },
        });
        if (item.options.length > 0) {
          await tx.saleItemModifier.createMany({
            data: item.options.map((option) => ({
              tenantId,
              saleItemId: saleItem.id,
              modifierOptionId: option.id,
              name: option.name,
              priceDelta: option.priceDelta,
            })),
          });
        }
      }

      return tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: {
          branch: true,
          terminal: true,
          items: { include: { modifiers: true } },
        },
      });
    });
  }
}
