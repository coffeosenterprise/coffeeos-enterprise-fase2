/**
 * Roles de sistema sembrados automaticamente al crear un Tenant
 * (Libro 04, cap. 03). OWNER recibe todos los permisos del catalogo;
 * el resto de roles se crea sin permisos asignados por defecto --
 * su asignacion detallada de permisos es una tarea de configuracion
 * posterior a Fase 1 (no bloquea el criterio de salida de esta fase,
 * que solo exige que existan roles y que un usuario sin permiso sea
 * rechazado).
 */
export const DEFAULT_SYSTEM_ROLES = [
  'OWNER',
  'ADMIN',
  'MANAGER',
  'CASHIER',
  'BARISTA',
  'KITCHEN',
  'WAREHOUSE',
  'ACCOUNTANT',
  'VIEWER',
] as const;

export type DefaultSystemRole = (typeof DEFAULT_SYSTEM_ROLES)[number];
