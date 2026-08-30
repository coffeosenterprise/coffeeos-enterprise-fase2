import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Marca un endpoint con los permisos requeridos.
 * Usado junto con PermissionsGuard.
 * Ej: @RequirePermissions('users.manage')
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
