import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { getTenantContext } from '../../../common/tenant/tenant-context';

@Injectable()
export class CompanyRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { name: string; taxId?: string; currency?: string; timezone?: string }) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext((tx) =>
      tx.company.create({ data: { tenantId, ...data } }),
    );
  }

  findById(id: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.company.findFirst({ where: { id, deletedAt: null } }),
    );
  }

  list() {
    return this.prisma.withTenantContext((tx) =>
      tx.company.findMany({ where: { deletedAt: null } }),
    );
  }
}
