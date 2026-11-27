import { and, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { getCommissionRateMap } from "@/lib/db/commission-rates";
import { getDentistTierMap, getTierRateMap } from "@/lib/db/commission-tiers";
import { findProcedureByName, getProcedureVatMap } from "@/lib/db/procedures";
import { findDentistUserByName } from "@/lib/db/dentists";
import {
  commissionForLine,
  type CommissionRateMaps,
} from "@/lib/cashflow/commission-calc";
import { round2 } from "@/lib/cashflow/pricing";

/** Every rate, loaded once. */
export async function loadCommissionRateMaps(): Promise<CommissionRateMaps> {
  const [individual, tier, dentistTier, procedureVat] = await Promise.all([
    getCommissionRateMap(),
    getTierRateMap(),
    getDentistTierMap(),
    getProcedureVatMap(),
  ]);
  return { individual, tier, dentistTier, procedureVat };
}

export type RecalcScope = {
  /** Only these dentists' lines (main or transferred). */
  dentistUserIds?: readonly string[];
  /** Only lines of these procedures. */
  procedureIds?: readonly string[];
};

export type RecalcResult = {
  /** Lines looked at. */
  lines: number;
  /** Lines whose commission changed. */
  changed: number;
  /** Lines that were also linked to their procedure or dentist (by name) for the first time. */
  linked: number;
  /** The total change in commission (new minus old), both halves together. */
  difference: number;
  /** Up to 20 changed lines, for a dry run's printout. */
  samples: Array<{ date: string; procedure: string; from: number; to: number }>;
};

const CHUNK = 400;

/**
 * Works out again, from the rates in force now, the commission of every
 * saved procedure line in `scope` (everything when no scope is given) and
 * stores it. Checked and approved visits are included: the clinic wants a
 * rate change to apply to every visit (November 2026). Lines with no linked
 * procedure are matched by name first, as when a visit is saved.
 */
export async function recalculateCommissions(
  scope: RecalcScope = {},
  options: { dryRun?: boolean } = {},
): Promise<RecalcResult> {
  // Lines with a dentist account, or with a dentist name that may match one.
  const filters: SQL[] = [
    or(isNotNull(transactions.dentistUserId), ne(transactions.dentist, "")) as SQL,
  ];
  if (scope.dentistUserIds) {
    if (scope.dentistUserIds.length === 0) return emptyResult();
    filters.push(inArray(transactions.dentistUserId, [...scope.dentistUserIds]));
  }
  if (scope.procedureIds) {
    if (scope.procedureIds.length === 0) return emptyResult();
    filters.push(inArray(transactions.procedureId, [...scope.procedureIds]));
  }

  const [maps, rows] = await Promise.all([
    loadCommissionRateMaps(),
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        dentistUserId: transactions.dentistUserId,
        dentist: transactions.dentist,
        procedureId: transactions.procedureId,
        procedure: transactions.procedure,
        paymentType: transactions.paymentType,
        amountPaid: transactions.amountPaid,
        vatType: transactions.vatType,
        discountReason: transactions.discountReason,
        withholdingTax: transactions.withholdingTax,
        transferDentist: transactions.transferDentist,
        transferDentistUserId: transactions.transferDentistUserId,
        commission: transactions.commissionAmount,
        transferCommission: transactions.transferCommissionAmount,
      })
      .from(transactions)
      .where(and(...filters)),
  ]);

  // Lines saved before their procedure was on the price list: link by name.
  const unlinkedNames = [
    ...new Set(
      rows
        .filter((row) => !row.procedureId && row.procedure.trim())
        .map((row) => row.procedure.trim().toLowerCase()),
    ),
  ];
  const found = await Promise.all(unlinkedNames.map((name) => findProcedureByName(name)));
  const procedureIdByName = new Map<string, string>();
  unlinkedNames.forEach((name, index) => {
    const match = found[index];
    if (match) procedureIdByName.set(name, match.id);
  });

  // Lines saved before the dentist had an account: link by name too.
  const unlinkedDentists = [
    ...new Set(
      rows
        .filter((row) => !row.dentistUserId && row.dentist.trim())
        .map((row) => row.dentist.trim().toLowerCase()),
    ),
  ];
  const dentistMatches = await Promise.all(
    unlinkedDentists.map((name) => findDentistUserByName(name)),
  );
  const dentistIdByName = new Map<string, string>();
  unlinkedDentists.forEach((name, index) => {
    const match = dentistMatches[index];
    if (match) dentistIdByName.set(name, match.id);
  });

  type Update = {
    id: string;
    main: number;
    transfer: number;
    procedureId: string | null;
    dentistUserId: string | null;
  };
  const updates: Update[] = [];
  let linked = 0;
  let difference = 0;
  const samples: RecalcResult["samples"] = [];
  for (const row of rows) {
    const newDentist = row.dentistUserId
      ? null
      : (dentistIdByName.get(row.dentist.trim().toLowerCase()) ?? null);
    const dentistUserId = row.dentistUserId ?? newDentist;
    if (!dentistUserId) continue;
    const newlyLinked = row.procedureId
      ? null
      : (procedureIdByName.get(row.procedure.trim().toLowerCase()) ?? null);
    const result = commissionForLine(
      {
        dentistUserId,
        procedureId: row.procedureId ?? newlyLinked,
        procedure: row.procedure,
        paymentType: row.paymentType,
        amountPaid: Number(row.amountPaid),
        vatType: row.vatType,
        discountReason: row.discountReason,
        withholdingTax: Number(row.withholdingTax),
        transferDentistUserId:
          row.transferDentist && row.transferDentistUserId ? row.transferDentistUserId : null,
      },
      maps,
    );
    const oldMain = round2(Number(row.commission));
    const oldTransfer = round2(Number(row.transferCommission));
    if (result.main !== oldMain || result.transfer !== oldTransfer || newlyLinked || newDentist) {
      updates.push({
        id: row.id,
        main: result.main,
        transfer: result.transfer,
        procedureId: newlyLinked,
        dentistUserId: newDentist,
      });
      difference = round2(difference + result.main + result.transfer - oldMain - oldTransfer);
      if (samples.length < 20) {
        samples.push({
          date: row.date,
          procedure: row.procedure,
          from: round2(oldMain + oldTransfer),
          to: round2(result.main + result.transfer),
        });
      }
      if (newlyLinked || newDentist) linked += 1;
    }
  }

  for (let i = 0; !options.dryRun && i < updates.length; i += CHUNK) {
    const part = updates.slice(i, i + CHUNK);
    const values = sql.join(
      part.map(
        (u) =>
          sql`(${u.id}, ${u.main.toFixed(2)}::numeric, ${u.transfer.toFixed(2)}::numeric, ${u.procedureId}::uuid, ${u.dentistUserId}::uuid)`,
      ),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE transactions AS t
      SET commission_amount = v.main,
          transfer_commission_amount = v.transfer,
          procedure_id = COALESCE(t.procedure_id, v.procedure_id),
          dentist_user_id = COALESCE(t.dentist_user_id, v.dentist_user_id)
      FROM (VALUES ${values}) AS v(id, main, transfer, procedure_id, dentist_user_id)
      WHERE t.id = v.id
    `);
  }

  return {
    lines: rows.length,
    changed: updates.length,
    linked,
    difference,
    samples,
  };
}

function emptyResult(): RecalcResult {
  return { lines: 0, changed: 0, linked: 0, difference: 0, samples: [] };
}

/** Lines with a dentist that are not linked to a price-list procedure (they earn nothing). */
export async function countUnlinkedCommissionLines(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        isNotNull(transactions.dentistUserId),
        isNull(transactions.procedureId),
        ne(transactions.procedure, ""),
      ),
    );
  return row?.n ?? 0;
}
