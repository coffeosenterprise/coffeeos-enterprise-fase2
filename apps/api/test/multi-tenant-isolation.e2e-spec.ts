/**
 * Suite de aislamiento Multi-Tenant — Fase 0.
 * Referencia: ADR-005, Gate 0 / G0-001, Libro 04 cap. 17 (SEV-1:
 * "Fuga potencial entre Tenants").
 *
 * Este es el criterio de aceptacion mas critico del sistema
 * (ver Registro de Cierre del Gate 0). Se construye ANTES que
 * cualquier modulo de negocio, no en paralelo ni despues.
 *
 * Requiere una base de datos PostgreSQL con la migracion
 * 0001_init_foundation aplicada (ver .github/workflows/ci.yml).
 * No se ejecuta en este entorno de preparacion de Fase 0 por no
 * contar con una base de datos real disponible aqui -- queda
 * lista para correr en CI / entorno del equipo.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { runWithTenantContext } from '../src/common/tenant/tenant-context';
import { randomUUID } from 'node:crypto';

describe('Aislamiento Multi-Tenant (RLS)', () => {
  let prisma: PrismaService;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    const raw = new PrismaClient();
    const a = await raw.tenant.create({
      data: { name: 'Tenant A (test)', slug: `tenant-a-${randomUUID()}` },
    });
    const b = await raw.tenant.create({
      data: { name: 'Tenant B (test)', slug: `tenant-b-${randomUUID()}` },
    });
    tenantA = a.id;
    tenantB = b.id;
    await raw.$disconnect();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('el Tenant A puede leer sus propios registros de auditoria', async () => {
    await runWithTenantContext(
      { tenantId: tenantA, correlationId: randomUUID() },
      async () => {
        await prisma.withTenantContext((tx) =>
          tx.auditLog.create({
            data: {
              tenantId: tenantA,
              action: 'TEST_ACTION',
              entity: 'test',
            },
          }),
        );

        const rows = await prisma.withTenantContext((tx) =>
          tx.auditLog.findMany(),
        );

        expect(rows.every((r) => r.tenantId === tenantA)).toBe(true);
        expect(rows.length).toBeGreaterThan(0);
      },
    );
  });

  it('el Tenant B NUNCA ve registros del Tenant A, aunque los consulte sin filtro', async () => {
    await runWithTenantContext(
      { tenantId: tenantB, correlationId: randomUUID() },
      async () => {
        const rows = await prisma.withTenantContext((tx) =>
          tx.auditLog.findMany(),
        );

        expect(rows.some((r) => r.tenantId === tenantA)).toBe(false);
      },
    );
  });

  it('rechaza cualquier intento de escribir con un tenant_id distinto al del contexto activo', async () => {
    await runWithTenantContext(
      { tenantId: tenantB, correlationId: randomUUID() },
      async () => {
        await expect(
          prisma.withTenantContext((tx) =>
            tx.auditLog.create({
              data: {
                tenantId: tenantA, // intento deliberado de fuga
                action: 'INTENTO_DE_FUGA',
                entity: 'test',
              },
            }),
          ),
        ).rejects.toThrow();
      },
    );
  });
});
