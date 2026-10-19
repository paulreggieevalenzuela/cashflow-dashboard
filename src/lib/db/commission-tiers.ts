import { and, eq, inArray } from "drizzle-orm";
import type { CommissionRateSetting } from "@/lib/cashflow/pricing";
import { db } from "@/lib/db/client";
import {
  commissionTierRates,
  dentistCommissionRates,
  dentistCommissionTiers,
  procedures,
  users,
} from "@/lib/db/schema";

export type TierRate = {
  id: string;
  tier: number;
  procedureId: string;
  procedureName: string;
  ratePercent: number;
  hmoRatePercent: number | null;
  pesoValue: number | null;
  hmoPesoValue: number | null;
};

export type DentistTier = {
  dentistUserId: string;
  tier: number;
};

const toNumberOrNull = (value: string | null) =>
  value === null ? null : Number(value);

export async function listTierRates(): Promise<TierRate[]> {
  const rows = await db
    .select({
      id: commissionTierRates.id,
      tier: commissionTierRates.tier,
      procedureId: commissionTierRates.procedureId,
      procedureName: procedures.name,
      ratePercent: commissionTierRates.ratePercent,
      hmoRatePercent: commissionTierRates.hmoRatePercent,
      pesoValue: commissionTierRates.pesoValue,
      hmoPesoValue: commissionTierRates.hmoPesoValue,
    })
    .from(commissionTierRates)
    .innerJoin(procedures, eq(procedures.id, commissionTierRates.procedureId))
    .orderBy(procedures.name, commissionTierRates.tier);

  return rows.map((row) => ({
    ...row,
    ratePercent: Number(row.ratePercent),
    hmoRatePercent: toNumberOrNull(row.hmoRatePercent),
    pesoValue: toNumberOrNull(row.pesoValue),
    hmoPesoValue: toNumberOrNull(row.hmoPesoValue),
  }));
}

/** Every tier rate as a `tier:procedureId -> setting` map (one query, for
 * resolving commission on a whole batch of lines). */
export async function getTierRateMap(): Promise<
  Map<string, CommissionRateSetting>
> {
  const rows = await db
    .select({
      tier: commissionTierRates.tier,
      procedureId: commissionTierRates.procedureId,
      ratePercent: commissionTierRates.ratePercent,
      hmoRatePercent: commissionTierRates.hmoRatePercent,
      pesoValue: commissionTierRates.pesoValue,
      hmoPesoValue: commissionTierRates.hmoPesoValue,
    })
    .from(commissionTierRates);

  return new Map(
    rows.map((row) => [
      `${row.tier}:${row.procedureId}`,
      {
        ratePercent: Number(row.ratePercent),
        hmoRatePercent: toNumberOrNull(row.hmoRatePercent),
        pesoValue: toNumberOrNull(row.pesoValue),
        hmoPesoValue: toNumberOrNull(row.hmoPesoValue),
      },
    ]),
  );
}

/** `dentistUserId -> tier` for every dentist that has one. */
export async function getDentistTierMap(): Promise<Map<string, number>> {
  const rows = await db.select().from(dentistCommissionTiers);
  return new Map(rows.map((row) => [row.dentistUserId, row.tier]));
}

export async function listDentistTiers(): Promise<DentistTier[]> {
  const rows = await db.select().from(dentistCommissionTiers);
  return rows.map((row) => ({
    dentistUserId: row.dentistUserId,
    tier: row.tier,
  }));
}

/** Puts a dentist in a tier, or takes them out of tiers (`null`). */
export async function setDentistTier(
  dentistUserId: string,
  tier: number | null,
): Promise<void> {
  if (tier === null) {
    await db
      .delete(dentistCommissionTiers)
      .where(eq(dentistCommissionTiers.dentistUserId, dentistUserId));
    return;
  }
  const updated = await db
    .update(dentistCommissionTiers)
    .set({ tier, updatedAt: new Date() })
    .where(eq(dentistCommissionTiers.dentistUserId, dentistUserId))
    .returning({ id: dentistCommissionTiers.dentistUserId });
  if (updated.length === 0) {
    await db.insert(dentistCommissionTiers).values({ dentistUserId, tier });
  }
}

/**
 * Sets a procedure's rate for a tier. "Update it, otherwise add it" (same
 * approach as `setCommissionRate`) so it never depends on an `ON CONFLICT`
 * constraint being present.
 */
export async function setTierRate(
  tier: number,
  procedureId: string,
  rates: {
    ratePercent: number;
    hmoRatePercent: number | null;
    pesoValue: number | null;
    hmoPesoValue: number | null;
  },
): Promise<void> {
  const values = {
    ratePercent: rates.ratePercent.toString(),
    hmoRatePercent: rates.hmoRatePercent?.toString() ?? null,
    pesoValue: rates.pesoValue?.toString() ?? null,
    hmoPesoValue: rates.hmoPesoValue?.toString() ?? null,
  };
  const pair = and(
    eq(commissionTierRates.tier, tier),
    eq(commissionTierRates.procedureId, procedureId),
  );
  const updated = await db
    .update(commissionTierRates)
    .set({ ...values, updatedAt: new Date() })
    .where(pair)
    .returning({ id: commissionTierRates.id });
  if (updated.length === 0) {
    await db.insert(commissionTierRates).values({ tier, procedureId, ...values });
  }
}

export async function deleteTierRate(id: string): Promise<void> {
  await db.delete(commissionTierRates).where(eq(commissionTierRates.id, id));
}

/**
 * Removes the individual rates of every dentist that has a tier, so their
 * tier rates apply to all procedures. Staff bonus rates are never touched.
 * Returns how many rates were removed.
 */
export async function clearIndividualRatesForTieredDentists(): Promise<number> {
  const tiered = await db
    .select({ id: dentistCommissionTiers.dentistUserId })
    .from(dentistCommissionTiers)
    .innerJoin(users, eq(users.id, dentistCommissionTiers.dentistUserId))
    .where(eq(users.role, "dentist"));
  if (tiered.length === 0) {
    return 0;
  }
  const removed = await db
    .delete(dentistCommissionRates)
    .where(
      inArray(
        dentistCommissionRates.dentistUserId,
        tiered.map((row) => row.id),
      ),
    )
    .returning({ id: dentistCommissionRates.id });
  return removed.length;
}
