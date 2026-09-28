import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import type { ReportQueryDto } from './reporting.dto';

type Aggregate = {
  revenue: number;
  cost: number;
  profit: number;
  units: number;
};

const emptyAggregate = (): Aggregate => ({
  revenue: 0,
  cost: 0,
  profit: 0,
  units: 0,
});

const formatAggregate = (value: Aggregate) => ({
  revenue: value.revenue.toFixed(2),
  cost: value.cost.toFixed(2),
  profit: value.profit.toFixed(2),
  margin: value.revenue
    ? ((value.profit / value.revenue) * 100).toFixed(2)
    : '0.00',
  units: value.units,
});

const aggregateSales = (
  sales: {
    total: unknown;
    costTotal: unknown;
    grossProfit: unknown;
    items: { quantity: number }[];
  }[],
) => {
  const aggregate = emptyAggregate();
  for (const sale of sales) {
    aggregate.revenue += Number(sale.total);
    aggregate.cost += Number(sale.costTotal);
    aggregate.profit += Number(sale.grossProfit);
    aggregate.units += sale.items.reduce((sum, item) => sum + item.quantity, 0);
  }
  return aggregate;
};

const compareAggregates = (current: Aggregate, previous: Aggregate) => {
  const delta = (now: number, before: number) => ({
    current: now.toFixed(2),
    previous: before.toFixed(2),
    difference: (now - before).toFixed(2),
    trend: now > before ? 'up' : now < before ? 'down' : 'stable',
  });
  return {
    revenue: delta(current.revenue, previous.revenue),
    cost: delta(current.cost, previous.cost),
    profit: delta(current.profit, previous.profit),
    margin: delta(
      current.revenue ? (current.profit / current.revenue) * 100 : 0,
      previous.revenue ? (previous.profit / previous.revenue) * 100 : 0,
    ),
    units: delta(current.units, previous.units),
  };
};

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  overview(query: ReportQueryDto) {
    const to = query.to
      ? new Date(`${query.to.slice(0, 10)}T23:59:59.999Z`)
      : new Date();
    const from = query.from
      ? new Date(`${query.from.slice(0, 10)}T00:00:00.000Z`)
      : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
    const periodLength = to.getTime() - from.getTime() + 1;
    const previousTo = new Date(from.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - periodLength + 1);

    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from > to
    ) {
      throw new BadRequestException('El periodo del reporte no es valido');
    }

    return this.prisma.withTenantContext(async (tx) => {
      const sales = await tx.sale.findMany({
        where: {
          status: 'completed',
          createdAt: { gte: from, lte: to },
          ...(query.branchId ? { branchId: query.branchId } : {}),
        },
        orderBy: { createdAt: 'asc' },
        include: {
          items: {
            include: {
              product: { include: { category: true, ingredients: true } },
            },
          },
        },
      });
      const previousSales = await tx.sale.findMany({
        where: {
          status: 'completed',
          createdAt: { gte: previousFrom, lte: previousTo },
          ...(query.branchId ? { branchId: query.branchId } : {}),
        },
        select: {
          total: true,
          costTotal: true,
          grossProfit: true,
          items: { select: { quantity: true } },
        },
      });

      const totals = emptyAggregate();
      const daily = new Map<string, Aggregate>();
      const products = new Map<
        string,
        Aggregate & { productId: string; name: string; category: string }
      >();
      const categories = new Map<string, Aggregate>();

      for (const sale of sales) {
        const day = sale.createdAt.toISOString().slice(0, 10);
        const dayAggregate = daily.get(day) ?? emptyAggregate();
        dayAggregate.revenue += Number(sale.total);
        dayAggregate.cost += Number(sale.costTotal);
        dayAggregate.profit += Number(sale.grossProfit);
        dayAggregate.units += sale.items.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );
        daily.set(day, dayAggregate);

        for (const item of sale.items) {
          const revenue = Number(item.subtotal);
          const cost = Number(item.costTotal);
          const profit = Number(item.grossProfit);
          totals.revenue += revenue;
          totals.cost += cost;
          totals.profit += profit;
          totals.units += item.quantity;

          const categoryName = item.product.category.name;
          const product = products.get(item.productId) ?? {
            productId: item.productId,
            name: item.productName,
            category: categoryName,
            ...emptyAggregate(),
          };
          product.revenue += revenue;
          product.cost += cost;
          product.profit += profit;
          product.units += item.quantity;
          products.set(item.productId, product);

          const category = categories.get(categoryName) ?? emptyAggregate();
          category.revenue += revenue;
          category.cost += cost;
          category.profit += profit;
          category.units += item.quantity;
          categories.set(categoryName, category);
        }
      }

      const stockWhere = query.branchId ? { branchId: query.branchId } : {};
      const stocks = await tx.inventoryStock.findMany({
        where: stockWhere,
        include: { ingredient: true },
        orderBy: { updatedAt: 'desc' },
      });
      const inventoryValue = stocks.reduce(
        (sum, stock) =>
          sum + Number(stock.quantity) * Number(stock.averageUnitCost),
        0,
      );
      const lowStock = stocks
        .filter(
          (stock) => Number(stock.quantity) <= Number(stock.minQuantity),
        )
        .slice(0, 20)
        .map((stock) => ({
          ingredientId: stock.ingredientId,
          name: stock.ingredient.name,
          quantity: Number(stock.quantity).toFixed(3),
          minQuantity: Number(stock.minQuantity).toFixed(3),
          unit: stock.ingredient.unit,
          averageUnitCost: Number(stock.averageUnitCost).toFixed(4),
        }));

      const productRows = [...products.values()]
        .sort((a, b) => b.profit - a.profit)
        .map((product) => ({
          productId: product.productId,
          name: product.name,
          category: product.category,
          ...formatAggregate(product),
        }));
      const categoryRows = [...categories.entries()]
        .sort(([, a], [, b]) => b.profit - a.profit)
        .map(([name, aggregate]) => ({
          name,
          ...formatAggregate(aggregate),
        }));
      const lowMarginProducts = productRows
        .filter(
          (product) =>
            Number(product.margin) < 30 && product.revenue !== '0.00',
        )
        .slice(0, 10);
      const salesWithoutCost = sales.filter((sale) =>
        sale.items.some((item) => Number(item.costTotal) === 0),
      ).length;
      const productsWithoutRecipe = new Set(
        sales.flatMap((sale) =>
          sale.items
            .filter((item) => item.product.ingredients.length === 0)
            .map((item) => item.productId),
        ),
      ).size;

      return {
        period: {
          from: from.toISOString(),
          to: to.toISOString(),
        },
        sales: {
          count: sales.length,
          ...formatAggregate(totals),
          averageTicket: sales.length
            ? (totals.revenue / sales.length).toFixed(2)
          : '0.00',
        },
        comparison: compareAggregates(totals, aggregateSales(previousSales)),
        daily: [...daily.entries()].map(([date, aggregate]) => ({
          date,
          ...formatAggregate(aggregate),
        })),
        products: productRows,
        categories: categoryRows,
        topProducts: productRows.slice(0, 10),
        lowMarginProducts,
        alerts: {
          lowMarginProducts: lowMarginProducts.length,
          lowStockIngredients: lowStock.length,
          salesWithoutCost,
          productsWithoutRecipe,
        },
        inventory: {
          value: inventoryValue.toFixed(2),
          lowStock,
          trackedIngredients: stocks.length,
        },
      };
    });
  }
}
