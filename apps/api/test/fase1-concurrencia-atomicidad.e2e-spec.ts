/**
 * Fase 1 v1.7 -- pruebas de concurrencia y atomicidad.
 *
 * Requiere PostgreSQL real con la migracion 0004 aplicada (rol
 * coffeeos_app) -- no se ejecuto en este entorno de preparacion por
 * no contar con una base de datos disponible aqui.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/exceptions/global-exception.filter';
import { FaultInjector } from '../src/common/testing/fault-injector';
import { PROVISIONING_CHECKPOINT_AFTER_FIRST_AUDIT_LOG } from '../src/modules/tenant-provisioning/application/tenant-provisioning.service';

describe('Fase 1 v1.7 — Concurrencia y Atomicidad', () => {
  let app: INestApplication;
  // Conexion ADMINISTRATIVA (rol superusuario, via DATABASE_URL por
  // defecto de schema.prisma) usada SOLO para verificar en estas
  // pruebas -- deliberadamente bypassa RLS (ver ADR-022) para poder
  // confirmar la ausencia total de filas sin depender de un
  // TenantContext. La aplicacion bajo prueba (`app`, servida via
  // supertest) sigue usando APP_DATABASE_URL internamente a traves
  // de PrismaService -- eso es justamente lo que se esta probando.
  let adminPrisma: PrismaClient;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    adminPrisma = new PrismaClient(); // usa DATABASE_URL (rol admin)
  });

  afterAll(async () => {
    await adminPrisma.$disconnect();
    await app.close();
  });

  function makeTenantPayload(slug?: string) {
    const finalSlug = slug ?? `cafeteria-${randomUUID().slice(0, 8)}`;
    return {
      slug: finalSlug,
      name: `Cafeteria ${finalSlug}`,
      owner: {
        email: `owner-${randomUUID().slice(0, 8)}@coffeeos.test`,
        firstName: 'Olivia',
        lastName: 'Owner',
        password: 'ClaveSegura!2026',
      },
    };
  }

  describe('Correccion #1 (v1.2) — Bootstrap atomico del Tenant: carrera por slug', () => {
    it(
      'dos intentos concurrentes de crear el MISMO slug: exactamente uno ' +
        'responde 201, el otro responde 400 (nunca 500) y no deja rastro',
      async () => {
        const sharedSlug = `atomic-test-${randomUUID().slice(0, 8)}`;
        const payloadA = makeTenantPayload(sharedSlug);
        const payloadB = makeTenantPayload(sharedSlug); // mismo slug, owner distinto

        const [resA, resB] = await Promise.allSettled([
          request(app.getHttpServer()).post('/api/v1/tenants').send(payloadA),
          request(app.getHttpServer()).post('/api/v1/tenants').send(payloadB),
        ]);

        const statuses = [resA, resB].map((r) =>
          r.status === 'fulfilled' ? r.value.status : 'rejected',
        );

        // Fase 1 v1.3, correccion #2: si esto alguna vez devuelve 500
        // en vez de 400, es porque TenantProvisioningService dejo de
        // traducir el error P2002 (constraint UNIQUE de slug) a un
        // BadRequestException -- ver el catch en ese servicio.
        expect(statuses.filter((s) => s === 201).length).toBe(1);
        expect(statuses.filter((s) => s === 400).length).toBe(1);
        expect(statuses.filter((s) => s === 500).length).toBe(0);

        const tenant = await adminPrisma.tenant.findUnique({
          where: { slug: sharedSlug },
        });
        expect(tenant).not.toBeNull();

        const roleCount = await adminPrisma.role.count({
          where: { tenantId: tenant!.id },
        });
        const userCount = await adminPrisma.user.count({
          where: { tenantId: tenant!.id },
        });

        expect(roleCount).toBe(9); // DEFAULT_SYSTEM_ROLES
        expect(userCount).toBe(1); // solo el owner ganador
      },
    );
  });

  describe('Correccion #3 (v1.3) / #1 (v1.4) — Bootstrap atomico: fallo tardio revierte TODO', () => {
    afterEach(() => {
      // Por si una asercion falla antes de que el checkpoint se
      // consuma solo, nunca debe quedar armado para el siguiente test.
      FaultInjector.disarm();
    });

    it(
      'un fallo forzado DESPUES de crear Tenant, roles, Owner, UserRole y ' +
        'el primer AuditLog (y antes del commit) revierte absolutamente todo',
      async () => {
        const slug = `atomic-late-fail-${randomUUID().slice(0, 8)}`;
        const payload = makeTenantPayload(slug);

        // Fase 1 v1.5, correccion #1: la v1.4 verificaba la ausencia
        // del segundo audit log buscando `actorId: orphanUser?.id` --
        // pero como orphanUser es null (correctamente), eso se
        // convertia en `actorId: undefined`, que en Prisma significa
        // "sin filtro por actorId", no "actorId es null". Esa consulta
        // podia encontrar TENANT_OWNER_BOOTSTRAPPED de CUALQUIER otro
        // test de la misma suite (p.ej. el de la carrera de slug, que
        // si crea un Tenant exitosamente), dando un falso positivo.
        //
        // Se reemplaza por conteo antes/despues: si el rollback
        // funciona, el numero total de TENANT_OWNER_BOOTSTRAPPED en
        // toda la base de datos no debe cambiar por este intento
        // fallido, sin importar cuantos existan ya de otros tests
        // (esta suite no limpia datos entre tests deliberadamente,
        // para poder correr en paralelo sin depender de orden).
        const countBefore = await adminPrisma.auditLog.count({
          where: { action: 'TENANT_OWNER_BOOTSTRAPPED' },
        });

        FaultInjector.armFailure(PROVISIONING_CHECKPOINT_AFTER_FIRST_AUDIT_LOG);

        const res = await request(app.getHttpServer())
          .post('/api/v1/tenants')
          .send(payload);

        expect(res.status).toBeGreaterThanOrEqual(400);

        const tenant = await adminPrisma.tenant.findUnique({ where: { slug } });
        expect(tenant).toBeNull();

        const orphanUser = await adminPrisma.user.findFirst({
          where: { email: payload.owner.email },
        });
        expect(orphanUser).toBeNull();

        const orphanRoles = await adminPrisma.role.findMany({
          where: { tenant: { slug } },
        });
        expect(orphanRoles).toHaveLength(0);

        const orphanUserRoles = await adminPrisma.userRole.findMany({
          where: { role: { tenant: { slug } } },
        });
        expect(orphanUserRoles).toHaveLength(0);

        const orphanAuditLogs = await adminPrisma.auditLog.findMany({
          where: { payload: { path: ['slug'], equals: slug } },
        });
        expect(orphanAuditLogs).toHaveLength(0);

        const countAfter = await adminPrisma.auditLog.count({
          where: { action: 'TENANT_OWNER_BOOTSTRAPPED' },
        });
        expect(countAfter).toBe(countBefore);
      },
    );
  });

  describe('Correccion #2 (v1.2) — Rotacion atomica de Refresh Token', () => {
    it(
      'el mismo refresh token usado dos veces en paralelo: exactamente ' +
        'una rotacion tiene exito, la otra es rechazada',
      async () => {
        const payload = makeTenantPayload();
        await request(app.getHttpServer()).post('/api/v1/tenants').send(payload).expect(201);

        const login = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({
            tenantSlug: payload.slug,
            email: payload.owner.email,
            password: payload.owner.password,
          })
          .expect(201);

        const sharedRefreshToken = login.body.refreshToken;

        const [resA, resB] = await Promise.allSettled([
          request(app.getHttpServer())
            .post('/api/v1/auth/refresh')
            .send({ refreshToken: sharedRefreshToken }),
          request(app.getHttpServer())
            .post('/api/v1/auth/refresh')
            .send({ refreshToken: sharedRefreshToken }),
        ]);

        const statuses = [resA, resB].map((r) =>
          r.status === 'fulfilled' ? r.value.status : 'rejected',
        );

        expect(statuses.filter((s) => s === 201).length).toBe(1);
        expect(statuses.filter((s) => s === 401).length).toBe(1);

        const winner = [resA, resB].find(
          (r) => r.status === 'fulfilled' && r.value.status === 201,
        );
        expect(winner).toBeDefined();
        if (winner && winner.status === 'fulfilled') {
          expect(winner.value.body.accessToken).toBeDefined();
          expect(winner.value.body.refreshToken).not.toBe(sharedRefreshToken);
        }
      },
    );
  });
});
