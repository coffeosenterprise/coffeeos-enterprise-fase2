import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { getTenantContext } from '../../../common/tenant/tenant-context';

interface RotatedSessionRow {
  id: string;
  user_id: string;
}

@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    userId: string;
    refreshTokenHash: string;
    userAgent?: string;
    ipAddress?: string;
    expiresAt: Date;
  }) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext((tx) =>
      tx.session.create({ data: { tenantId, ...data } }),
    );
  }

  findActiveByUser(userId: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.session.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
    );
  }

  /**
   * Fase 1 v1.2, correccion #2: revoca la sesion activa asociada al
   * hash Y crea la sesion de reemplazo dentro de UNA transaccion,
   * usando una actualizacion condicional atomica (`UPDATE ... WHERE
   * revoked_at IS NULL ... RETURNING`) como mecanismo de concurrencia.
   *
   * Si dos requests concurrentes presentan el MISMO refresh token,
   * Postgres serializa la fila: solo una de las dos transacciones
   * encuentra `revoked_at IS NULL` y logra actualizarla (la otra
   * queda bloqueada hasta que la primera confirma, y al reintentar su
   * propia condicion ya no se cumple -- 0 filas afectadas). Por eso
   * NUNCA pueden generarse dos sesiones nuevas validas a partir de un
   * mismo refresh token, sin importar el orden de llegada.
   *
   * Retorna null si el token ya fue usado, revocado o expiro -- el
   * llamador debe tratarlo como no autorizado, no como error interno.
   */
  async rotate(
    refreshTokenHash: string,
    newTokenData: { refreshTokenHash: string; expiresAt: Date },
  ): Promise<{ userId: string } | null> {
    const { tenantId } = getTenantContext();

    return this.prisma.withTenantContext(async (tx) => {
      const revoked = await tx.$queryRaw<RotatedSessionRow[]>`
        UPDATE sessions
        SET revoked_at = now()
        WHERE refresh_token_hash = ${refreshTokenHash}
          AND tenant_id = ${tenantId}::uuid
          AND revoked_at IS NULL
          AND expires_at > now()
        RETURNING id, user_id
      `;

      if (revoked.length === 0) {
        return null;
      }

      const userId = revoked[0].user_id;

      await tx.session.create({
        data: { tenantId, userId, ...newTokenData },
      });

      return { userId };
    });
  }

  revoke(sessionId: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      }),
    );
  }

  revokeAllForUser(userId: string) {
    return this.prisma.withTenantContext((tx) =>
      tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }
}
