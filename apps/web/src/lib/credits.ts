/**
 * Monthly AI credit allowance per plan.
 * Single source of truth — the Stripe webhook grants these amounts on
 * upgrade/renewal, and any UI showing "used/total" reads the same table
 * instead of guessing a number that could drift from what's actually
 * granted.
 */
export const PLAN_CREDIT_LIMITS: Record<string, number> = {
  FREE: 50,
  BASIC: 100,
  PRO: 500,
  SCALE: 3000,
}

export function creditLimitForPlan(plan: string): number {
  return PLAN_CREDIT_LIMITS[plan] ?? PLAN_CREDIT_LIMITS.FREE
}
