module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  // Fase 1 v1.6, corrección #1: varios archivos de prueba comparten
  // la MISMA base de datos real (no hay una BD aislada por archivo).
  // La prueba de rollback tardío cuenta filas de audit_log a nivel
  // global (no por tenant) -- si otro archivo de prueba corre en
  // paralelo y crea un Tenant legítimo mientras esa cuenta está en
  // curso, el conteo "antes/después" puede verse alterado por datos
  // ajenos al propio test, no por un bug real. maxWorkers: 1 fuerza
  // que todos los archivos de prueba corran en un único proceso, uno
  // a la vez -- equivalente a `--runInBand` sin depender de que quien
  // invoque `npm test` recuerde pasar el flag.
  maxWorkers: 1,
};
