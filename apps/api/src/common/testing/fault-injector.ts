/**
 * Mecanismo de inyeccion de fallos EXCLUSIVO para pruebas
 * (Fase 1 v1.4, correccion #1).
 *
 * Por que existe: la prueba de rollback tardio necesita forzar un
 * error DENTRO de una transaccion Prisma real, despues de que varias
 * operaciones ya se ejecutaron con exito sobre el `tx` transaccional
 * -- no sobre `prismaService` (son objetos distintos; un spy sobre
 * `prismaService.auditLog.create` nunca intercepta `tx.auditLog.create`,
 * que es el que el codigo de negocio realmente usa). En vez de
 * depender de mockear los internos de Prisma, se agrega un punto de
 * control explicito y deliberado en el propio codigo de produccion.
 *
 * Seguridad de que esto no afecta produccion:
 *  - `checkpoint()` es un no-op inmediato si NODE_ENV !== 'test'.
 *  - `armFailure()` lanza si se llama fuera de NODE_ENV=test -- no se
 *    puede "armar" un failpoint por accidente en ningun otro ambiente.
 *  - Cada armado se consume una sola vez (se desarma solo al disparar),
 *    para que un test no deje el failpoint activo para el siguiente.
 */
export class FaultInjector {
  private static armedCheckpoint: string | null = null;

  static armFailure(checkpoint: string): void {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error(
        'FaultInjector.armFailure() solo puede usarse con NODE_ENV=test',
      );
    }
    this.armedCheckpoint = checkpoint;
  }

  static disarm(): void {
    this.armedCheckpoint = null;
  }

  static checkpoint(name: string): void {
    if (process.env.NODE_ENV !== 'test') return;
    if (this.armedCheckpoint === name) {
      this.armedCheckpoint = null;
      throw new Error(
        `Fallo inyectado deliberadamente en el checkpoint "${name}" (FaultInjector, solo pruebas)`,
      );
    }
  }
}
