'use strict';

const adminConnection = process.env.DATABASE_URL;
const appPassword = process.env.APP_DB_ROLE_PASSWORD;

if (!adminConnection) {
  console.error('[production] FATAL: DATABASE_URL no esta configurada.');
  process.exit(1);
}

if (!appPassword) {
  console.error(
    '[production] FATAL: APP_DB_ROLE_PASSWORD no esta configurada.',
  );
  process.exit(1);
}

let connection;
try {
  connection = new URL(adminConnection);
} catch {
  console.error(
    '[production] FATAL: DATABASE_URL no tiene un formato valido.',
  );
  process.exit(1);
}

const adminUser = decodeURIComponent(connection.username);
const poolerSuffix = adminUser.includes('.')
  ? adminUser.slice(adminUser.indexOf('.'))
  : '';

connection.username = `coffeeos_app${poolerSuffix}`;
connection.password = appPassword;
connection.searchParams.set('schema', 'public');

process.stdout.write(connection.toString());
