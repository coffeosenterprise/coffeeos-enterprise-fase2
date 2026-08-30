import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { getTenantContext } from '../../../common/tenant/tenant-context';

@Injectable()
export class TerminalRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(branchId: string, data: { name: string; code: string }) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext((tx) =>
      tx.terminal.create({ data: { tenantId, branchId, ...data } }),
    );
  }

  listByBranch(branchId: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.terminal.findMany({ where: { branchId, deletedAt: null } }),
    );
  }
}
