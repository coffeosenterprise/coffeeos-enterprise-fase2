import { TenantProvisioningService } from '../src/modules/tenant-provisioning/application/tenant-provisioning.service';

describe('TenantProvisioningService con RLS en tenants', () => {
  const originalVerificationSetting =
    process.env.EMAIL_VERIFICATION_REQUIRED;

  afterAll(() => {
    if (originalVerificationSetting === undefined) {
      delete process.env.EMAIL_VERIFICATION_REQUIRED;
    } else {
      process.env.EMAIL_VERIFICATION_REQUIRED =
        originalVerificationSetting;
    }
  });

  it('establece el contexto antes del INSERT y usa el mismo UUID', async () => {
    process.env.EMAIL_VERIFICATION_REQUIRED = 'false';
    const callOrder: string[] = [];
    let configuredTenantId: unknown;

    const executeRaw = jest.fn(async (...args: unknown[]) => {
      configuredTenantId = args[1];
      callOrder.push('set-context');
      return 1;
    });
    const createTenant = jest.fn(async ({ data }) => {
      callOrder.push('create-tenant');
      return data;
    });
    const createRole = jest.fn(async ({ data }) => ({
      ...data,
      id: `role-${data.name}`,
    }));

    const tx = {
      $executeRaw: executeRaw,
      tenant: { create: createTenant },
      role: { create: createRole },
      permission: { findMany: jest.fn(async () => []) },
      rolePermission: { createMany: jest.fn(async () => ({ count: 0 })) },
      user: {
        create: jest.fn(async ({ data }) => ({
          ...data,
          id: 'owner-id',
        })),
      },
      userRole: { create: jest.fn(async () => ({ id: 'user-role-id' })) },
      emailVerification: {
        create: jest.fn(async () => ({ id: 'verification-id' })),
      },
      auditLog: { create: jest.fn(async () => ({ id: 'audit-id' })) },
    };

    const prisma = {
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    const service = new TenantProvisioningService(
      { findBySlug: jest.fn(async () => null) } as never,
      { hash: jest.fn(async () => 'password-hash') } as never,
      prisma as never,
      { sendVerificationCode: jest.fn() } as never,
    );

    const result = await service.create({
      name: 'Cafeteria RLS',
      slug: 'cafeteria-rls',
      owner: {
        email: 'owner@coffeeos.test',
        firstName: 'Olivia',
        lastName: 'Owner',
        password: 'ClaveSegura!2026',
      },
    });

    expect(callOrder.slice(0, 2)).toEqual([
      'set-context',
      'create-tenant',
    ]);

    const insertedTenantId = createTenant.mock.calls[0][0].data.id;
    expect(configuredTenantId).toBe(insertedTenantId);
    expect(result.tenantId).toBe(insertedTenantId);
  });
});
