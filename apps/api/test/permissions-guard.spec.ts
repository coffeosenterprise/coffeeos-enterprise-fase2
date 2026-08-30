/**
 * Prueba unitaria (sin base de datos) -- criterio de salida de
 * Fase 1: "Un usuario sin permiso recibe rechazo."
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../src/common/auth/permissions.guard';

function buildContext(userPermissions: string[]): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { permissions: userPermissions } }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('rechaza cuando el usuario no tiene el permiso requerido', () => {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['users.manage']);

    const guard = new PermissionsGuard(reflector);
    const context = buildContext(['sales.create']);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('permite el acceso cuando el usuario tiene el permiso requerido', () => {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['users.manage']);

    const guard = new PermissionsGuard(reflector);
    const context = buildContext(['users.manage', 'sales.create']);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('permite el acceso cuando el endpoint no requiere permisos', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const guard = new PermissionsGuard(reflector);
    const context = buildContext([]);

    expect(guard.canActivate(context)).toBe(true);
  });
});
