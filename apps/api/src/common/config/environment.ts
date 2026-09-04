/**
 * Ambientes oficiales (Registro de Cierre Documental): Local,
 * Development, Testing, Staging, Production.
 */
const NON_LOCAL_ENVIRONMENTS = ['staging', 'production'];

export function isSensitiveEnvironment(): boolean {
  const env = (process.env.NODE_ENV ?? 'development').toLowerCase();
  return NON_LOCAL_ENVIRONMENTS.includes(env);
}

export function shouldExposeDevelopmentSecrets(): boolean {
  return (
    !isSensitiveEnvironment() &&
    process.env.EXPOSE_DEVELOPMENT_SECRETS === 'true'
  );
}

/**
 * Valida configuracion critica al arrancar. Si falta algo
 * indispensable en Staging/Production, el proceso NO debe arrancar
 * (Fase 1, correccion #12) -- un fallback silencioso de JWT_SECRET
 * es una vulnerabilidad, no una conveniencia.
 *
 * Fase 1 v1.7, correccion #1: esta funcion NO valida DATABASE_URL.
 * docker-entrypoint.sh elimina esa variable del entorno
 * DELIBERADAMENTE antes de arrancar el proceso Node (Fase 1 v1.6,
 * correccion #3) -- el runtime nunca debe tener ni necesitar acceso
 * al rol administrador. Exigir DATABASE_URL aqui creaba una
 * contradiccion real: el entrypoint la borraba y esta funcion
 * abortaba el arranque un instante despues por su ausencia. La
 * validacion de DATABASE_URL (y de APP_DB_ROLE_PASSWORD en
 * Staging/Production) vive exclusivamente en docker-entrypoint.sh,
 * que corre ANTES de que el proceso Node exista.
 */
export function validateEnvironmentOrExit(): void {
  if (!isSensitiveEnvironment()) return;

  const errors: string[] = [];
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret || jwtSecret === 'CHANGE_ME_IN_PRODUCTION' || jwtSecret.length < 32) {
    errors.push(
      'JWT_SECRET no esta configurado o es demasiado corto/inseguro para este ambiente (minimo 32 caracteres, sin usar el valor de ejemplo).',
    );
  }

  if (!process.env.APP_DATABASE_URL) {
    errors.push(
      'APP_DATABASE_URL no esta configurado (ADR-022) -- sin el, la aplicacion no puede conectarse a la base de datos con el rol restringido.',
    );
  }

  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: 'fatal',
        message: 'Configuracion invalida para este ambiente. Abortando arranque.',
        errors,
      }),
    );
    process.exit(1);
  }
}
