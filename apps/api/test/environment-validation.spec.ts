/**
 * Prueba unitaria (sin base de datos) -- Fase 1 v1.7, correccion #1.
 *
 * Demuestra especificamente la contradiccion que se corrigio: un
 * proceso Node arrancando en un ambiente equivalente a
 * Staging/Production, con DATABASE_URL ausente (tal como queda tras
 * el unset de docker-entrypoint.sh) pero con APP_DATABASE_URL y
 * JWT_SECRET presentes, debe arrancar sin abortar.
 */
import { validateEnvironmentOrExit } from '../src/common/config/environment';

describe('validateEnvironmentOrExit (Fase 1 v1.7)', () => {
  const originalEnv = { ...process.env };
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit fue llamado');
    }) as never);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    exitSpy.mockRestore();
  });

  it(
    'NO aborta en NODE_ENV=production con DATABASE_URL ausente ' +
      '(exactamente el estado tras docker-entrypoint.sh)',
    () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DATABASE_URL; // simula el unset del entrypoint
      process.env.APP_DATABASE_URL =
        'postgresql://coffeeos_app:secret@db:5432/coffeeos';
      process.env.JWT_SECRET = 'a'.repeat(32);

      expect(() => validateEnvironmentOrExit()).not.toThrow();
      expect(exitSpy).not.toHaveBeenCalled();
    },
  );

  it('SI aborta en production si falta APP_DATABASE_URL', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    delete process.env.APP_DATABASE_URL;
    process.env.JWT_SECRET = 'a'.repeat(32);

    expect(() => validateEnvironmentOrExit()).toThrow();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('SI aborta en production si JWT_SECRET es demasiado corto', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_DATABASE_URL =
      'postgresql://coffeeos_app:secret@db:5432/coffeeos';
    process.env.JWT_SECRET = 'demasiado-corto';

    expect(() => validateEnvironmentOrExit()).toThrow();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('no valida nada en development, aunque falte todo', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_URL;
    delete process.env.APP_DATABASE_URL;
    delete process.env.JWT_SECRET;

    expect(() => validateEnvironmentOrExit()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
