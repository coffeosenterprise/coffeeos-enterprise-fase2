import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('permission catalog repair migration', () => {
  it('re-seeds permissions, removes orphan assignments and restores OWNER access', () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        'prisma',
        'migrations',
        '0009_repair_permission_catalog',
        'migration.sql',
      ),
      'utf8',
    );

    expect(sql).toContain(
      'ALTER TABLE permissions ENABLE ROW LEVEL SECURITY',
    );
    expect(sql).toContain('CREATE POLICY permissions_read_catalog');
    expect(sql).toContain('FOR SELECT');
    expect(sql).toContain('TO coffeeos_app');
    expect(sql).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON permissions FROM coffeeos_app',
    );
    expect(sql).toContain('INSERT INTO permissions (key, description)');
    expect(sql).toContain('DELETE FROM role_permissions rp');
    expect(sql).toContain('WHERE NOT EXISTS');
    expect(sql).toContain("WHERE r.name = 'OWNER'");
    expect(sql).toContain('ON CONFLICT DO NOTHING');
  });
});
