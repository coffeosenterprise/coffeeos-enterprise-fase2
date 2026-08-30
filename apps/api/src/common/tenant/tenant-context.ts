import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexto de Tenant -- obligatorio en toda operacion de negocio.
 * Referencia: ADR-005 (RLS ratificado, Gate 0 / G0-001).
 *
 * Ninguna consulta a base de datos debe ejecutarse fuera de un
 * TenantContext activo. PrismaService.withTenantContext() lo exige.
 */
export interface TenantContextData {
  tenantId: string;
  userId?: string;
  correlationId: string;
}

export const tenantContextStorage = new AsyncLocalStorage<TenantContextData>();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function getTenantContext(): TenantContextData {
  const ctx = tenantContextStorage.getStore();
  if (!ctx) {
    throw new Error(
      'No hay TenantContext activo. Toda operación de negocio debe ejecutarse dentro de un contexto de tenant (ver ADR-005).',
    );
  }
  return ctx;
}

export function runWithTenantContext<T>(
  ctx: TenantContextData,
  fn: () => T,
): T {
  if (!isValidUuid(ctx.tenantId)) {
    throw new Error(`tenantId inválido: "${ctx.tenantId}" no es un UUID.`);
  }
  return tenantContextStorage.run(ctx, fn);
}

/**
 * Fija el TenantContext para el RESTO de la cadena asincrona actual
 * (usado por JwtAuthGuard: a diferencia de runWithTenantContext, no
 * envuelve un callback -- continua en el mismo contexto de ejecucion
 * de Nest/Express, que es exactamente lo que un Guard necesita para
 * que Interceptors/Pipes/Controller/Service/Repository posteriores
 * vean el contexto sin refactorizar todo el pipeline de Nest a
 * callbacks anidados).
 */
export function enterTenantContext(ctx: TenantContextData): void {
  if (!isValidUuid(ctx.tenantId)) {
    throw new Error(`tenantId inválido: "${ctx.tenantId}" no es un UUID.`);
  }
  tenantContextStorage.enterWith(ctx);
}

// ============================================================
// Tokens compuestos (tenantId + secreto aleatorio)
//
// Problema que resuelven: varios flujos (refresh token, activacion
// de invitacion, reset de contrasena) deben poder resolver a que
// Tenant pertenecen ANTES de que exista un TenantContext -- porque
// son, precisamente, el mecanismo que lo establece. La alternativa
// (una tabla de busqueda global sin RLS) expone mas superficie; el
// tenantId no es secreto por si mismo (es un identificador, no una
// credencial), asi que anteponerlo en claro al secreto aleatorio no
// debilita la seguridad del token -- solo su parte aleatoria (que
// nunca se expone en claro fuera de la respuesta inicial) protege la
// posesion real. Documentado en ADR-019.
// ============================================================

const COMPOSITE_TOKEN_SEPARATOR = '.';

export function encodeCompositeToken(
  tenantId: string,
  secret: string,
): string {
  return `${tenantId}${COMPOSITE_TOKEN_SEPARATOR}${secret}`;
}

export function decodeCompositeToken(
  token: string,
): { tenantId: string; secret: string } {
  const separatorIndex = token.indexOf(COMPOSITE_TOKEN_SEPARATOR);
  if (separatorIndex === -1) {
    throw new Error('Formato de token invalido');
  }
  const tenantId = token.slice(0, separatorIndex);
  const secret = token.slice(separatorIndex + 1);

  if (!isValidUuid(tenantId) || secret.length === 0) {
    throw new Error('Formato de token invalido');
  }

  return { tenantId, secret };
}
