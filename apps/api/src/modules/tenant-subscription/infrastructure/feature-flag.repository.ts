import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { getTenantContext } from '../../../common/tenant/tenant-context';

@Injectable()
export class FeatureFlagRepository {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.withTenantContext((tx) => tx.featureFlag.findMany());
  }

  set(key: string, enabled: boolean) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext((tx) =>
      tx.featureFlag.upsert({
        where: { tenantId_key: { tenantId, key } },
        create: { tenantId, key, enabled },
        update: { enabled },
      }),
    );
  }
}
