/**
 * Limites por plan comercial (Libro 01/02: Starter/Professional/Enterprise).
 * Los valores concretos son de referencia -- no fueron confirmados como
 * definitivos por ningun libro (quedaron marcados como "Ejemplos" en el
 * Libro 04, cap. 20). Un Tenant Enterprise puede sobreescribirlos via
 * el campo customLimits.
 */
export interface PlanLimits {
  maxBranches: number;
  maxUsers: number;
  maxProducts: number;
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  starter: { maxBranches: 1, maxUsers: 5, maxProducts: 100 },
  professional: { maxBranches: 5, maxUsers: 25, maxProducts: 1000 },
  enterprise: { maxBranches: 9999, maxUsers: 9999, maxProducts: 9999 },
};

export function resolvePlanLimits(
  plan: string,
  customLimits: Partial<PlanLimits> | null,
): PlanLimits {
  const base = PLAN_LIMITS[plan] ?? PLAN_LIMITS.starter;
  return { ...base, ...(customLimits ?? {}) };
}
