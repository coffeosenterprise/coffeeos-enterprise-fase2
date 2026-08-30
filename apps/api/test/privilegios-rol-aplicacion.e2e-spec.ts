/**
 * Fase 1 v1.8, correccion #2 -- verifica en base de datos real que
 * coffeeos_app (rol runtime) no puede escribir en tablas que deben
 * quedar fuera de su alcance: el catalogo global `permissions`
 * (Fase 1 v1.4) y el historial de migraciones `_prisma_migrations`
 * (Fase 1 v1.8).
 *
 * Requiere PostgreSQL real con las 5 migraciones aplicadas y
 * APP_DATABASE_URL configurada -- no se ejecuto en este entorno de
 * preparacion por no contar con una base de datos disponible aqui.
 */
import { PrismaClient } from '@prisma/client';

describe('Privilegios del rol de aplicación (coffeeos_app)', () => {
  let appPrisma: PrismaClient;

  beforeAll(() => {
    // Conexion EXPLICITA como coffeeos_app -- no via PrismaService
    // (que ya no acepta arrancar sin APP_DATABASE_URL, ver
    // prisma-service.spec.ts), sino un cliente crudo apuntando a la
    // misma URL, para probar los privilegios del rol directamente.
    appPrisma = new PrismaClient({
      datasources: { db: { url: process.env.APP_DATABASE_URL } },
    });
  });

  afterAll(async () => {
    await appPrisma.$disconnect();
  });

  it('no puede insertar en el catálogo global `permissions`', async () => {
    await expect(
      appPrisma.permission.create({
        data: { key: 'intento.no.autorizado', description: 'test' },
      }),
    ).rejects.toThrow();
  });

  it('no puede modificar `_prisma_migrations` (historial de migraciones)', async () => {
    await expect(
      appPrisma.$executeRawUnsafe(
        `UPDATE "_prisma_migrations" SET applied_steps_count = 0`,
      ),
    ).rejects.toThrow();

    await expect(
      appPrisma.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at) ` +
          `VALUES ('test-id', 'fake', 'fake_migration', now())`,
      ),
    ).rejects.toThrow();
  });

  it('SÍ puede leer `permissions` (solo lectura, no sin acceso alguno)', async () => {
    const permissions = await appPrisma.permission.findMany();
    expect(Array.isArray(permissions)).toBe(true);
  });
});
