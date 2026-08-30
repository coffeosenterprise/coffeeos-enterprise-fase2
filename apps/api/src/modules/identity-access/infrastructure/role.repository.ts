import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { getTenantContext } from '../../../common/tenant/tenant-context';
import { DEFAULT_SYSTEM_ROLES } from '../domain/default-roles';

@Injectable()
export class RoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(roleId: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.role.findFirst({ where: { id: roleId } }),
    );
  }

  findByName(name: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.role.findFirst({ where: { name } }),
    );
  }

  list() {
    return this.prisma.withTenantContext((tx) => tx.role.findMany());
  }

  /**
   * Siembra los roles de sistema para un Tenant recien creado.
   * OWNER recibe todos los permisos del catalogo global; el resto
   * de roles se crea sin permisos por defecto (ver domain/default-roles.ts).
   */
  async seedDefaultRoles(): Promise<void> {
    const { tenantId } = getTenantContext();

    await this.prisma.withTenantContext(async (tx) => {
      const allPermissions = await tx.permission.findMany();

      for (const roleName of DEFAULT_SYSTEM_ROLES) {
        const role = await tx.role.create({
          data: { tenantId, name: roleName, isSystem: true },
        });

        if (roleName === 'OWNER') {
          await tx.rolePermission.createMany({
            data: allPermissions.map((p) => ({
              tenantId,
              roleId: role.id,
              permissionId: p.id,
            })),
          });
        }
      }
    });
  }
}
