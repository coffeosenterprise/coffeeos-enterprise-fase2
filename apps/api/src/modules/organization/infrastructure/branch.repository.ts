import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { getTenantContext } from '../../../common/tenant/tenant-context';

@Injectable()
export class BranchRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(companyId: string, data: { name: string; address?: string }) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext((tx) =>
      tx.branch.create({ data: { tenantId, companyId, ...data } }),
    );
  }

  findById(id: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.branch.findFirst({ where: { id, deletedAt: null } }),
    );
  }

  listByCompany(companyId: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.branch.findMany({ where: { companyId, deletedAt: null } }),
    );
  }

  assignUser(branchId: string, userId: string) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext((tx) =>
      tx.userBranchAssignment.create({ data: { tenantId, branchId, userId } }),
    );
  }
}
