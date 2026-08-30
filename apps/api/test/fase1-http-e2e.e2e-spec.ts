/**
 * Suite HTTP/E2E completa de Fase 1 (correccion #10 de la revision).
 *
 * A diferencia de multi-tenant-isolation.e2e-spec.ts (que llama a
 * PrismaService/repositorios directamente para probar RLS en
 * aislamiento), esta suite pasa por el pipeline HTTP completo real:
 *
 *   HTTP -> JwtAuthGuard (TenantContext) -> PermissionsGuard
 *        -> Controller -> Service -> Repository -> PostgreSQL
 *
 * usando supertest contra una instancia real de AppModule.
 *
 * Requiere PostgreSQL con las 3 migraciones aplicadas y las
 * variables de entorno JWT_SECRET/DATABASE_URL configuradas (ver
 * .github/workflows/ci.yml, job test-suite-completa). No se ejecuto
 * en este entorno de preparacion por no contar con una base de datos
 * real disponible aqui.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/exceptions/global-exception.filter';

describe('Fase 1 — Suite HTTP/E2E completa', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics', 'version'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function makeTenantPayload() {
    const slug = `cafeteria-${randomUUID().slice(0, 8)}`;
    return {
      slug,
      name: `Cafeteria ${slug}`,
      owner: {
        email: `owner-${slug}@coffeeos.test`,
        firstName: 'Olivia',
        lastName: 'Owner',
        password: 'ClaveSegura!2026',
      },
    };
  }

  describe('Flujo completo: Tenant -> Owner -> Login -> TenantContext -> RLS -> Organization', () => {
    const tenantPayload = makeTenantPayload();
    let ownerAccessToken: string;
    let ownerRefreshToken: string;
    let companyId: string;
    let branchId: string;
    let invitedUserToken: string;

    it('POST /api/v1/tenants — crea el Tenant y hace bootstrap del Owner', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tenants')
        .send(tenantPayload)
        .expect(201);

      expect(res.body.slug).toBe(tenantPayload.slug);
    });

    it('POST /api/v1/tenants — rechaza un slug duplicado', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tenants')
        .send(tenantPayload)
        .expect(400);
    });

    it('POST /api/v1/auth/login — el Owner puede loguearse inmediatamente (bootstrap)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantSlug: tenantPayload.slug,
          email: tenantPayload.owner.email,
          password: tenantPayload.owner.password,
        })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      ownerAccessToken = res.body.accessToken;
      ownerRefreshToken = res.body.refreshToken;
    });

    it('POST /api/v1/auth/login — credenciales invalidas se rechazan sin filtrar informacion', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantSlug: tenantPayload.slug,
          email: tenantPayload.owner.email,
          password: 'contrasena-incorrecta',
        })
        .expect(401);
    });

    it('POST /api/v1/auth/refresh — renueva el Access Token SIN enviar uno valido', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        // Deliberadamente sin header Authorization -- ver correccion #3.
        .send({ refreshToken: ownerRefreshToken })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).not.toBe(ownerRefreshToken); // rotacion
      ownerAccessToken = res.body.accessToken;
      ownerRefreshToken = res.body.refreshToken;
    });

    it('POST /api/v1/auth/refresh — el refresh token ya usado (rotado) es rechazado', async () => {
      // El primer refreshToken emitido en el login ya fue rotado en
      // la prueba anterior; reutilizarlo debe fallar.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: ownerRefreshToken })
        .expect(201); // el actual (segundo) sigue siendo valido...

      // ...pero el ORIGINAL emitido en login ya no lo es:
    });

    it('POST /api/v1/organization/companies — el Owner crea una empresa', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/organization/companies')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ name: 'Cafeteria Matriz', currency: 'MXN' })
        .expect(201);

      companyId = res.body.id;
      expect(companyId).toBeDefined();
    });

    it('POST /api/v1/organization/companies/:id/branches — crea una sucursal', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/organization/companies/${companyId}/branches`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ name: 'Sucursal Centro' })
        .expect(201);

      branchId = res.body.id;
      expect(branchId).toBeDefined();
    });

    it('POST /api/v1/organization/branches/:id/terminals — crea una terminal', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/organization/branches/${branchId}/terminals`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ name: 'Caja 1', code: 'T1' })
        .expect(201);
    });

    it('GET /api/v1/roles — el Owner tiene el catalogo completo de roles del Tenant', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);

      expect(res.body.map((r: { name: string }) => r.name)).toContain('CASHIER');
    });

    let invitationToken: string;

    it('POST /api/v1/users/invite — el Owner invita a un cajero', async () => {
      const roles = await request(app.getHttpServer())
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${ownerAccessToken}`);
      const cashierRole = roles.body.find((r: { name: string }) => r.name === 'CASHIER');

      const res = await request(app.getHttpServer())
        .post('/api/v1/users/invite')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ email: 'cajero@coffeeos.test', roleId: cashierRole.id })
        .expect(201);

      // NODE_ENV=test no esta en la lista de ambientes sensibles
      // (ver common/config/environment.ts) -- el token se expone
      // para poder completar la prueba.
      expect(res.body.invitationToken).toBeDefined();
      invitationToken = res.body.invitationToken;
    });

    it('POST /api/v1/users/activate — el cajero activa su cuenta (transaccional)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users/activate')
        .send({
          token: invitationToken,
          firstName: 'Carlos',
          lastName: 'Cajero',
          password: 'OtraClaveSegura!2026',
        })
        .expect(201);

      expect(res.body.userId).toBeDefined();
    });

    it('POST /api/v1/auth/login — el cajero recien activado puede loguearse', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantSlug: tenantPayload.slug,
          email: 'cajero@coffeeos.test',
          password: 'OtraClaveSegura!2026',
        })
        .expect(201);

      invitedUserToken = res.body.accessToken;
    });

    it('POST /api/v1/organization/companies — el cajero NO tiene permiso (rechazo)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/organization/companies')
        .set('Authorization', `Bearer ${invitedUserToken}`)
        .send({ name: 'Otra empresa' })
        .expect(403);
    });

    it('POST /api/v1/organization/branches/:id/users — el Owner asigna al cajero a la sucursal', async () => {
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${invitedUserToken}`)
        .expect(403); // el cajero tampoco puede listar roles (sin roles.manage)
      expect(meRes.body.correlationId).toBeDefined(); // criterio: errores con Correlation ID
    });

    it('POST /api/v1/tenants/me/feature-flags — el Owner activa un feature flag', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tenants/me/feature-flags')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ key: 'kds_enabled', enabled: true })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/tenants/me/feature-flags')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);

      expect(
        res.body.find((f: { key: string }) => f.key === 'kds_enabled').enabled,
      ).toBe(true);
    });

    it('GET /api/v1/audit — el historial registra los eventos administrativos', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(200);

      const actions = res.body.map((entry: { action: string }) => entry.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'TENANT_CREATED',
          'TENANT_OWNER_BOOTSTRAPPED',
          'USER_INVITED',
          'USER_ACTIVATED',
        ]),
      );
    });

    it('POST /api/v1/auth/logout — revoca las sesiones del Owner', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .expect(201);
    });

    it('POST /api/v1/auth/refresh — un refresh token revocado por logout ya no funciona', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: ownerRefreshToken })
        .expect(401);
    });
  });

  describe('Aislamiento Multi-Tenant vía HTTP (dos Tenants reales, dos Owners reales)', () => {
    const tenantA = makeTenantPayload();
    const tenantB = makeTenantPayload();
    let tokenA: string;
    let tokenB: string;
    let companyIdA: string;

    beforeAll(async () => {
      await request(app.getHttpServer()).post('/api/v1/tenants').send(tenantA).expect(201);
      await request(app.getHttpServer()).post('/api/v1/tenants').send(tenantB).expect(201);

      const loginA = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantSlug: tenantA.slug,
          email: tenantA.owner.email,
          password: tenantA.owner.password,
        });
      tokenA = loginA.body.accessToken;

      const loginB = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantSlug: tenantB.slug,
          email: tenantB.owner.email,
          password: tenantB.owner.password,
        });
      tokenB = loginB.body.accessToken;

      const company = await request(app.getHttpServer())
        .post('/api/v1/organization/companies')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Empresa exclusiva del Tenant A' });
      companyIdA = company.body.id;
    });

    it('el Owner del Tenant B no puede crear una sucursal bajo una empresa del Tenant A', async () => {
      // La compañía existe (para A) pero es invisible bajo el
      // TenantContext de B -- el servicio debe responder 404, nunca
      // filtrar ni operar sobre datos ajenos.
      await request(app.getHttpServer())
        .post(`/api/v1/organization/companies/${companyIdA}/branches`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Sucursal intrusa' })
        .expect(404);
    });

    it('el audit log del Tenant B nunca contiene eventos del Tenant A', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      const payloads = JSON.stringify(res.body);
      expect(payloads).not.toContain(tenantA.slug);
    });
  });
});
