import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { patientHmos, patients } from "@/lib/db/schema";
import {
  hmoKey,
  type PatientHmoEntry,
} from "@/lib/cashflow/patient-hmo";

export const PATIENT_HMOS_NOT_READY =
  "Keeping more than one HMO per patient, and the patient's company, needs one more step first: run scripts/sql/2026-11-patient-hmos.sql in Neon, then try again.";

let warned = false;

/** The `patient_hmos` table doesn't exist yet (the SQL script wasn't run). */
export function patientHmosMissing(error: unknown): boolean {
  const text = String(error) + String((error as { cause?: unknown })?.cause ?? "");
  // Also true when the table is there but lacks the newer "employer" column.
  const missing = /patient_hmos|employer/.test(text) && /does not exist|relation/.test(text);
  if (missing && !warned) {
    warned = true;
    console.warn("Patient HMO lists are off: run scripts/sql/2026-11-patient-hmos.sql.");
  }
  return missing;
}

/** Is the list table there? (False until the SQL script has been run.) */
export async function patientHmosReady(): Promise<boolean> {
  try {
    await db
      .select({ id: patientHmos.id, employer: patientHmos.employer })
      .from(patientHmos)
      .limit(1);
    return true;
  } catch (error) {
    if (patientHmosMissing(error)) return false;
    throw error;
  }
}

/**
 * The HMOs of each patient, first one first. Patients without any are left
 * out. Empty while the table is missing.
 */
export async function listPatientHmos(
  patientIds: readonly string[],
): Promise<Map<string, PatientHmoEntry[]>> {
  const result = new Map<string, PatientHmoEntry[]>();
  const ids = [...new Set(patientIds)];
  if (ids.length === 0) return result;
  try {
    for (let i = 0; i < ids.length; i += 500) {
      const rows = await db
        .select({
          patientId: patientHmos.patientId,
          company: patientHmos.company,
          employer: patientHmos.employer,
          accountNumber: patientHmos.accountNumber,
        })
        .from(patientHmos)
        .where(inArray(patientHmos.patientId, ids.slice(i, i + 500)))
        .orderBy(asc(patientHmos.position), asc(patientHmos.createdAt));
      for (const row of rows) {
        const list = result.get(row.patientId) ?? [];
        list.push({
          company: row.company,
          employer: row.employer,
          accountNumber: row.accountNumber,
        });
        result.set(row.patientId, list);
      }
    }
  } catch (error) {
    if (patientHmosMissing(error)) return new Map();
    throw error;
  }
  return result;
}

/**
 * Saves a patient's whole HMO list (already cleaned) and copies the first
 * entry into the patient's two older columns, so the Day end report, the HMO
 * billing fallback and the search keep working. Entries not in the list are
 * removed. Returns false when the table is missing (nothing was saved).
 */
export async function savePatientHmos(
  patientId: string,
  list: readonly PatientHmoEntry[],
): Promise<boolean> {
  try {
    if (list.length === 0) {
      await db.delete(patientHmos).where(eq(patientHmos.patientId, patientId));
    } else {
      const keys = list.map((entry) => hmoKey(entry.company));
      await db
        .delete(patientHmos)
        .where(and(eq(patientHmos.patientId, patientId), notInArray(patientHmos.companyKey, keys)));
      await db
        .insert(patientHmos)
        .values(
          list.map((entry, index) => ({
            patientId,
            company: entry.company,
            companyKey: hmoKey(entry.company),
            employer: entry.employer,
            accountNumber: entry.accountNumber,
            position: index,
          })),
        )
        .onConflictDoUpdate({
          target: [patientHmos.patientId, patientHmos.companyKey],
          set: {
            company: sql`excluded.company`,
            employer: sql`excluded.employer`,
            accountNumber: sql`excluded.account_number`,
            position: sql`excluded.position`,
          },
        });
    }
  } catch (error) {
    if (patientHmosMissing(error)) return false;
    throw error;
  }
  await db
    .update(patients)
    .set({
      hmoCompany: list[0]?.company ?? "",
      hmoAccountNumber: list[0]?.accountNumber ?? "",
    })
    .where(eq(patients.id, patientId));
  return true;
}

/**
 * Merging two patients: the kept patient also gets the removed one's HMOs it
 * does not have yet (same company = the kept patient's entry stays).
 */
export async function mergePatientHmos(sourceId: string, targetId: string): Promise<void> {
  try {
    const [target, source] = await Promise.all([
      db.select().from(patientHmos).where(eq(patientHmos.patientId, targetId)),
      db.select().from(patientHmos).where(eq(patientHmos.patientId, sourceId)),
    ]);
    const have = new Set(target.map((row) => row.companyKey));
    let position = target.length;
    for (const row of source) {
      if (have.has(row.companyKey)) continue;
      await db
        .insert(patientHmos)
        .values({
          patientId: targetId,
          company: row.company,
          companyKey: row.companyKey,
          employer: row.employer,
          accountNumber: row.accountNumber,
          position: position++,
        })
        .onConflictDoNothing();
    }
    // (The removed patient's own rows go with it: ON DELETE CASCADE.)
    const merged = await db
      .select()
      .from(patientHmos)
      .where(eq(patientHmos.patientId, targetId))
      .orderBy(asc(patientHmos.position));
    if (merged.length > 0) {
      await db
        .update(patients)
        .set({
          hmoCompany: merged[0].company,
          hmoAccountNumber: merged[0].accountNumber,
        })
        .where(eq(patients.id, targetId));
    }
  } catch (error) {
    if (!patientHmosMissing(error)) throw error;
  }
}
