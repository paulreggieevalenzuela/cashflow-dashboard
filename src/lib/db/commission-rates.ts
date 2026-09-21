import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { dentistCommissionRates, procedures, users } from "@/lib/db/schema";

export type CommissionRate = {
  id: string;
  dentistUserId: string;
  dentistName: string;
  procedureId: string;
  procedureName: string;
  ratePercent: number;
};

export async function listCommissionRates(): Promise<CommissionRate[]> {
  const rows = await db
    .select({
      id: dentistCommissionRates.id,
      dentistUserId: dentistCommissionRates.dentistUserId,
      dentistName: users.name,
      procedureId: dentistCommissionRates.procedureId,
      procedureName: procedures.name,
      ratePercent: dentistCommissionRates.ratePercent,
    })
    .from(dentistCommissionRates)
    .innerJoin(users, eq(users.id, dentistCommissionRates.dentistUserId))
    .innerJoin(procedures, eq(procedures.id, dentistCommissionRates.procedureId))
    .orderBy(users.name, procedures.name);

  return rows.map((row) => ({ ...row, ratePercent: Number(row.ratePercent) }));
}

/**
 * Fetches every rate as a `dentistUserId:procedureId -> ratePercent` map,
 * for resolving commission on a whole batch of transactions (CSV import) in
 * one query instead of one lookup per row.
 */
export async function getCommissionRateMap(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      dentistUserId: dentistCommissionRates.dentistUserId,
      procedureId: dentistCommissionRates.procedureId,
      ratePercent: dentistCommissionRates.ratePercent,
    })
    .from(dentistCommissionRates);

  return new Map(
    rows.map((row) => [`${row.dentistUserId}:${row.procedureId}`, Number(row.ratePercent)]),
  );
}

export async function setCommissionRate(
  dentistUserId: string,
  procedureId: string,
  ratePercent: number,
): Promise<void> {
  await db
    .insert(dentistCommissionRates)
    .values({ dentistUserId, procedureId, ratePercent: ratePercent.toString() })
    .onConflictDoUpdate({
      target: [dentistCommissionRates.dentistUserId, dentistCommissionRates.procedureId],
      set: { ratePercent: ratePercent.toString(), updatedAt: new Date() },
    });
}

export async function deleteCommissionRate(id: string): Promise<void> {
  await db.delete(dentistCommissionRates).where(eq(dentistCommissionRates.id, id));
}
