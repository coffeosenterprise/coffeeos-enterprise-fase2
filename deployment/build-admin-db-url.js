'use strict';

const required = {
  DB_HOST: process.env.DB_HOST,
  DB_ADMIN_USER: process.env.DB_ADMIN_USER,
  DB_ADMIN_PASSWORD: process.env.DB_ADMIN_PASSWORD,
};

const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  console.error(
    `[production] FATAL: faltan variables de base de datos: ${missing.join(', ')}.`,
  );
  process.exit(1);
}

if (
  required.DB_HOST.endsWith('.pooler.supabase.com') &&
  !required.DB_ADMIN_USER.includes('.')
) {
  console.error(
    '[production] FATAL: DB_ADMIN_USER debe incluir el identificador del proyecto de Supabase, por ejemplo postgres.abcdefghijklmnop.',
  );
  process.exit(1);
}

const connection = new URL('postgresql://placeholder@localhost/postgres');
connection.hostname = required.DB_HOST;
connection.port = process.env.DB_PORT ?? '5432';
connection.username = required.DB_ADMIN_USER;
connection.password = required.DB_ADMIN_PASSWORD;
connection.pathname = `/${process.env.DB_NAME ?? 'postgres'}`;
connection.searchParams.set('sslmode', process.env.DB_SSLMODE ?? 'require');
connection.searchParams.set('schema', 'public');

process.stdout.write(connection.toString());
