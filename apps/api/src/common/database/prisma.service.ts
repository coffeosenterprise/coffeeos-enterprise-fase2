import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { getTenantContext, isValidUuid } from '../tenant/tenant-context';

/**
 * PrismaService — capa de acceso a datos con Row-Level Security obligatorio.
 * Referencia: ADR-005 (RLS ratificado, Gate 0 / G0-001), ADR-018 (ORM: Prisma),
 * ADR-022 (rol de aplicación restringido, Fase 1 v1.3).
 *
 * Regla dura: ningún repositorio de módulo debe usar PrismaClient
 * directamente. Toda operación de negocio pasa por withTenantContext(),
 * que fija `app.current_tenant` en la sesión de PostgreSQL antes de
 * ejecutar la consulta, activando las políticas RLS de cada tabla.
 *
 * La aplicación NUNCA confía únicamente en el filtrado por tenant_id
 * a nivel de código — RLS es la segunda capa obligatoria, no opcional.
 *
 * Fase 1 v1.3 (ADR-022): el constructor sobreescribe deliberadamente
 * la URL de conexión hacia `APP_DATABASE_URL` (rol `coffeeos_app`, sin
 * privilegios de superusuario ni BYPASSRLS) en vez de usar la
 * `DATABASE_URL` declarada en schema.prisma (rol administrador,
 * reservado para migraciones). Sin este cambio, la aplicación se
 * conectaba con el mismo rol superusuario que ejecuta las migraciones
 * -- y los superusuarios de Postgres bypassan RLS incondicionalmente,
 * volviendo cosmético todo el mecanismo de ADR-005.
 *
 * Fase 1 v1.8, correccion #1: se elimino el fallback
 * `APP_DATABASE_URL ?? DATABASE_URL` que existia hasta la v1.7. Ese
 * fallback era, en si mismo, una violacion latente de ADR-022: un
 * error de configuracion (APP_DATABASE_URL ausente) en
 * Local/Development/Testing habria hecho que el runtime se conectara
 * SILENCIOSAMENTE como el rol administrador -- bypassando RLS sin
 * que nada lo señalara. Ahora, si APP_DATABASE_URL falta, el
 * constructor lanza de inmediato y el proceso NUNCA llega a
 * arrancar con una conexion equivocada. DATABASE_URL queda
 * reservada exclusivamente para migraciones, provisioning y
 * herramientas administrativas (docker-entrypoint.sh, scripts en
 * prisma/provisioning/) -- PrismaService no la lee en ningun caso.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const appDatabaseUrl = process.env.APP_DATABASE_URL;

    if (!appDatabaseUrl) {
      throw new Error(
        'APP_DATABASE_URL no esta configurada. PrismaService NUNCA usa ' +
          'DATABASE_URL como respaldo (ADR-022) -- eso conectaria el ' +
          'runtime con el rol administrador, que bypasea RLS. Define ' +
          'APP_DATABASE_URL explicitamente antes de arrancar la aplicacion.',
      );
    }

    super({
      datasources: {
        db: { url: appDatabaseUrl },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async withTenantContext<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const { tenantId } = getTenantContext();

    if (!isValidUuid(tenantId)) {
      throw new Error(
        `tenantId inválido en TenantContext: "${tenantId}". Operación rechazada antes de tocar la base de datos.`,
      );
    }

    return this.$transaction(async (tx) => {
      // SET LOCAL solo dura la transacción; no hay riesgo de fuga entre
      // requests aunque se reutilice la misma conexión del pool.
      // El valor ya fue validado como UUID, por lo que la interpolación
      // es segura (Postgres no admite parámetros bind en SET LOCAL).
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant = '${tenantId}'`,
      );
      return fn(tx);
    });
  }
}
