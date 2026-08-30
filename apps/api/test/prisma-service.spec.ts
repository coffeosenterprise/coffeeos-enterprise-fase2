/**
 * Prueba unitaria (sin base de datos) -- Fase 1 v1.8, correccion #1.
 *
 * Demuestra que PrismaService NUNCA usa DATABASE_URL como respaldo de
 * APP_DATABASE_URL. El constructor solo llega a instanciar el
 * PrismaClient real si APP_DATABASE_URL esta presente; en caso
 * contrario lanza antes de intentar conectarse a nada, sin importar
 * si DATABASE_URL (rol administrador) esta disponible.
 */
import { PrismaService } from '../src/common/database/prisma.service';

describe('PrismaService (Fase 1 v1.8)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it(
    'lanza inmediatamente si APP_DATABASE_URL no esta definida, ' +
      'incluso si DATABASE_URL (rol administrador) SI lo esta',
    () => {
      delete process.env.APP_DATABASE_URL;
      process.env.DATABASE_URL =
        'postgresql://coffeeos:admin_secret@localhost:5432/coffeeos';

      // Si alguna vez reaparece un fallback a DATABASE_URL, esta
      // prueba pasa a fallar silenciosamente en vez de lanzar --
      // exactamente el escenario que ADR-022 prohibe.
      expect(() => new PrismaService()).toThrow(/APP_DATABASE_URL/);
    },
  );

  it('no construye ningun PrismaClient cuando falta APP_DATABASE_URL', () => {
    delete process.env.APP_DATABASE_URL;
    delete process.env.DATABASE_URL;

    expect(() => new PrismaService()).toThrow(/APP_DATABASE_URL/);
  });

  it('construye correctamente cuando APP_DATABASE_URL SI esta definida', () => {
    process.env.APP_DATABASE_URL =
      'postgresql://coffeeos_app:app_secret@localhost:5432/coffeeos';

    expect(() => new PrismaService()).not.toThrow();
  });
});
