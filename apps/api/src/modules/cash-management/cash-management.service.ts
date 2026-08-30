import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { getTenantContext } from '../../common/tenant/tenant-context';
import type {
  CloseCashSessionDto,
  OpenCashSessionDto,
} from './cash-management.dto';

@Injectable()
export class CashManagementService {
  constructor(private readonly prisma: PrismaService) {}

  current(terminalId: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.cashSession.findFirst({
        where: { terminalId, status: 'open' },
        include: {
          branch: true,
          terminal: true,
          sales: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
      }),
    );
  }

  open(actorId: string, dto: OpenCashSessionDto) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext(async (tx) => {
      const terminal = await tx.terminal.findFirst({
        where: {
          id: dto.terminalId,
          branchId: dto.branchId,
          status: 'active',
          deletedAt: null,
        },
      });
      if (!terminal) {
        throw new NotFoundException('Terminal o sucursal no encontrada');
      }
      const existing = await tx.cashSession.findFirst({
        where: { terminalId: dto.terminalId, status: 'open' },
      });
      if (existing) {
        throw new ConflictException('Esta terminal ya tiene una caja abierta');
      }
      return tx.cashSession.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          terminalId: dto.terminalId,
          openedById: actorId,
          openingAmount: dto.openingAmount,
        },
        include: { branch: true, terminal: true },
      });
    });
  }

  close(actorId: string, sessionId: string, dto: CloseCashSessionDto) {
    return this.prisma.withTenantContext(async (tx) => {
      const session = await tx.cashSession.findFirst({
        where: { id: sessionId, status: 'open' },
      });
      if (!session) throw new NotFoundException('Caja abierta no encontrada');

      const totals = await tx.sale.aggregate({
        where: { cashSessionId: session.id, status: 'completed' },
        _sum: { total: true },
        _count: { id: true },
      });
      const salesTotal = Number(totals._sum.total ?? 0);
      const expectedCash = Number(session.openingAmount) + salesTotal;
      const difference = dto.countedCash - expectedCash;
      if (!Number.isFinite(difference)) {
        throw new BadRequestException('El efectivo contado no es valido');
      }

      const closed = await tx.cashSession.update({
        where: { id: session.id },
        data: {
          status: 'closed',
          closedById: actorId,
          closedAt: new Date(),
          expectedCash,
          countedCash: dto.countedCash,
          difference,
          salesTotal,
          saleCount: totals._count.id,
        },
        include: { branch: true, terminal: true },
      });

      const allStocks = await tx.inventoryStock.findMany({
        where: { branchId: session.branchId },
        include: { ingredient: true },
      });
      const lowStock = allStocks.filter(
        (stock) => Number(stock.quantity) <= Number(stock.minQuantity),
      );
      return { ...closed, lowStock };
    });
  }
}
