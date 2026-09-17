import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Migracion de permisos OWNER', () => {
  it('asigna todos los permisos existentes de forma idempotente', () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        'prisma',
        'migrations',
        '0008_backfill_owner_permissions',
        'migration.sql',
      ),
      'utf8',
    );

    expect(sql).toContain(
      'INSERT INTO role_permissions (tenant_id, role_id, permission_id)',
    );
    expect(sql).toContain("WHERE roles.name = 'OWNER'");
    expect(sql).toContain('CROSS JOIN permissions');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
  });
});
