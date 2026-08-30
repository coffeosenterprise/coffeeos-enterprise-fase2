import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { getTenantContext } from '../tenant/tenant-context';
import type { Prisma } from '@prisma/client';

export interface RecordAuditEntryInput {
  tenantId?: string; // solo necesario si no hay TenantContext activo (ver recordWithTenant)
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string;
  payload?: Record<string, unknown>;
}

type TenantScopedTx = Omit<
  Prisma.TransactionClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Servicio transversal de auditoria (Libro 04, cap. 16).
 * Inmutabilidad garantizada a nivel de base de datos (migracion 0003,
 * trigger prevent_audit_log_mutation) -- este servicio nunca expone
 * update() ni delete() a proposito.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Usa el TenantContext activo; abre su propia transaccion. */
  async record(input: RecordAuditEntryInput): Promise<void> {
    const { tenantId } = getTenantContext();
    await this.prisma.withTenantContext((tx) =>
      tx.auditLog.create({
        data: {
          tenantId,
          actorId: input.actorId,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId,
          payload: input.payload as never,
        },
      }),
    );
  }

  /**
   * Registra un evento de auditoria DENTRO de una transaccion que ya
   * esta abierta (p.ej. la activacion de una invitacion, que debe
   * ser atomica -- Fase 1, correccion #7). No abre su propia
   * transaccion: usa el `tx` que el llamador ya tiene activo.
   */
  async recordWithinTransaction(
    tx: TenantScopedTx,
    tenantId: string,
    input: Omit<RecordAuditEntryInput, 'tenantId'>,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId: input.actorId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        payload: input.payload as never,
      },
    });
  }

  async history(entity?: string, entityId?: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.auditLog.findMany({
        where: {
          ...(entity ? { entity } : {}),
          ...(entityId ? { entityId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }
}
