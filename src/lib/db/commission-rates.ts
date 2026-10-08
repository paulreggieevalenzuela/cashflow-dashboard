import { and, eq } from "drizzle-orm";
import type { CommissionRateSetting } from "@/lib/cashflow/pricing";
import { db } from "@/lib/db/client";
import { dentistCommissionRates, procedures, users } from "@/lib/db/schema";

export type CommissionRate = {
  id: string;
  dentistUserId: string;
  dentistName: string;
  procedureId: string;
  procedureName: string;
  ratePercent: number;
  hmoRatePercent: number | null;
  hmoPesoValue: number | null;
};

const toNumberOrNull = (value: string | null) =>
  value === null ? null : Number(value);

export async function listCommissionRates(): Promise<CommissionRate[]> {
  const rows = await db
    .select({
      id: dentistCommissionRates.id,
      dentistUserId: dentistCommissionRates.dentistUserId,
      dentistName: users.name,
      procedureId: dentistCommissionRates.procedureId,
      procedureName: procedures.name,
      ratePercent: dentistCommissionRates.ratePercent,
      hmoRatePercent: dentistCommissionRates.hmoRatePercent,
      hmoPesoValue: dentistCommissionRates.hmoPesoValue,
    })
    .from(dentistCommissionRates)
    .innerJoin(users, eq(users.id, dentistCommissionRates.dentistUserId))
    .innerJoin(
      procedures,
      eq(procedures.id, dentistCommissionRates.procedureId),
    )
    .orderBy(users.name, procedures.name);

  return rows.map((row) => ({
    ...row,
    ratePercent: Number(row.ratePercent),
    hmoRatePercent: toNumberOrNull(row.hmoRatePercent),
    hmoPesoValue: toNumberOrNull(row.hmoPesoValue),
  }));
}

/**
 * Fetches every rate as a `dentistUserId:procedureId -> ratePercent` map,
 * for resolving commission on a whole batch of transactions (CSV import) in
 * one query instead of one lookup per row.
 */
export async function getCommissionRateMap(): Promise<
  Map<string, CommissionRateSetting>
> {
  const rows = await db
    .select({
      dentistUserId: dentistCommissionRates.dentistUserId,
      procedureId: dentistCommissionRates.procedureId,
      ratePercent: dentistCommissionRates.ratePercent,
      hmoRatePercent: dentistCommissionRates.hmoRatePercent,
      hmoPesoValue: dentistCommissionRates.hmoPesoValue,
    })
    .from(dentistCommissionRates);

  return new Map(
    rows.map((row) => [
      `${row.dentistUserId}:${row.procedureId}`,
      {
        ratePercent: Number(row.ratePercent),
        hmoRatePercent: toNumberOrNull(row.hmoRatePercent),
        hmoPesoValue: toNumberOrNull(row.hmoPesoValue),
      },
    ]),
  );
}

/**
 * Sets the commission rate for one dentist + procedure pair. Written as
 * "update it, otherwise add it" rather than a single `ON CONFLICT` upsert,
 * so it keeps working even on a database where the unique (dentist,
 * procedure) constraint was never created — Postgres refuses an
 * `ON CONFLICT` against a constraint that isn't there. (The constraint
 * itself is created by `scripts/sql/2026-10-commission-rates-unique.sql`.)
 */
export async function setCommissionRate(
  dentistUserId: string,
  procedureId: string,
  rates: {
    ratePercent: number;
    hmoRatePercent?: number | null;
    hmoPesoValue?: number | null;
  },
): Promise<void> {
  const values = {
    ratePercent: rates.ratePercent.toString(),
    hmoRatePercent: rates.hmoRatePercent?.toString() ?? null,
    hmoPesoValue: rates.hmoPesoValue?.toString() ?? null,
  };
  const pair = and(
    eq(dentistCommissionRates.dentistUserId, dentistUserId),
    eq(dentistCommissionRates.procedureId, procedureId),
  );
  const updated = await db
    .update(dentistCommissionRates)
    .set({ ...values, updatedAt: new Date() })
    .where(pair)
    .returning({ id: dentistCommissionRates.id });

  if (updated.length === 0) {
    await db.insert(dentistCommissionRates).values({
      dentistUserId,
      procedureId,
      ...values,
    });
  }
}

export async function deleteCommissionRate(id: string): Promise<void> {
  await db
    .delete(dentistCommissionRates)
    .where(eq(dentistCommissionRates.id, id));
}
