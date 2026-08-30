/**
 * Invariantes de dominio de User (Identity & Access).
 * Politica de bloqueo: 5 intentos fallidos consecutivos bloquean
 * la cuenta 15 minutos (Libro 04, cap. 03).
 */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MINUTES = 15;

export type UserStatus = 'invited' | 'active' | 'blocked';

export function isAccountLocked(lockedUntil: Date | null): boolean {
  if (!lockedUntil) return false;
  return lockedUntil.getTime() > Date.now();
}

export function computeLockout(failedAttempts: number): Date | null {
  if (failedAttempts < MAX_FAILED_LOGIN_ATTEMPTS) return null;
  return new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60_000);
}
