/**
 * Commission tiers: each dentist belongs to a tier (1, 2 or 3) and a
 * procedure earns the tier's rate. Pure rules (no database, no React),
 * shared by the Commissions page and the save-time commission lookup.
 */

import type { CommissionRateSetting } from "@/lib/cashflow/pricing";

/** The tiers the clinic uses, highest first as on the clinic's sheet. */
export const COMMISSION_TIERS = [3, 2, 1] as const;

export type CommissionTier = (typeof COMMISSION_TIERS)[number];

export function isCommissionTier(value: unknown): value is CommissionTier {
  return value === 1 || value === 2 || value === 3;
}

export function tierLabel(tier: number): string {
  return `Tier ${tier}`;
}

/**
 * The rate a (dentist, procedure) pair earns: the dentist's own individual
 * rate when there is one (an override), otherwise the rate their tier gives
 * that procedure, otherwise nothing.
 */
export function resolveRateSetting(input: {
  individual: CommissionRateSetting | undefined;
  tierRate: CommissionRateSetting | undefined;
}): CommissionRateSetting | undefined {
  return input.individual ?? input.tierRate;
}

/** A tier rate as short text for the tier table, e.g. "25%", "₱70". */
export function describeTierRate(rate: {
  ratePercent: number;
  hmoRatePercent: number | null;
  pesoValue: number | null;
  hmoPesoValue: number | null;
}): string {
  const parts: string[] = [];
  if (rate.pesoValue !== null) {
    parts.push(`₱${rate.pesoValue}`);
  } else {
    parts.push(`${rate.ratePercent}%`);
  }
  if (rate.hmoPesoValue !== null) {
    parts.push(`HMO ₱${rate.hmoPesoValue}`);
  } else if (rate.hmoRatePercent !== null) {
    parts.push(`HMO ${rate.hmoRatePercent}%`);
  }
  return parts.join(" · ");
}
