import { and, asc, eq, inArray, like, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoices, patients } from "@/lib/db/schema";

/**
 * Patients are matched by name only: trimmed, runs of spaces collapsed,
 * lower-cased. "Maria  Santos" and "maria santos" are the same person. Two
 * different people with exactly the same name would merge — a limitation
 * the clinic accepted rather than asking staff for a birthday or ID.
 */
export function normalizeNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The name as it should be stored and shown: trimmed, single spaces. */
export function cleanDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export type PatientSummary = {
  id: string;
  fullName: string;
  /** Most recent visit date on file (YYYY-MM-DD), if any. */
  lastVisitDate: string | null;
  visitCount: number;
};

const CHUNK = 200;

/** Escapes `\`, `%` and `_` so user text is matched literally by LIKE. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

async function withVisitStats(rows: Array<{ id: string; fullName: string }>): Promise<PatientSummary[]> {
  if (rows.length === 0) {
    return [];
  }
  const stats = await db
    .select({
      patientId: invoices.patientId,
      lastVisitDate: sql<string>`max(${invoices.visitDate})`,
      visitCount: sql<number>`count(*)::int`,
    })
    .from(invoices)
    .where(
      and(
        inArray(
          invoices.patientId,
          rows.map((row) => row.id),
        ),
        eq(invoices.transactionType, "Visit"),
      ),
    )
    .groupBy(invoices.patientId);

  const byId = new Map(stats.map((stat) => [stat.patientId, stat]));
  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    lastVisitDate: byId.get(row.id)?.lastVisitDate ?? null,
    visitCount: byId.get(row.id)?.visitCount ?? 0,
  }));
}

/**
 * Typeahead search. Names that START with what was typed come first, then
 * names that merely contain it, so typing a last name's first letters
 * surfaces the likely patient straight away. Done in the database (not by
 * loading every patient into the browser) so it stays fast as the list
 * grows into the thousands.
 */
export async function searchPatients(query: string, limit = 8): Promise<PatientSummary[]> {
  const key = normalizeNameKey(query);
  if (!key) {
    return [];
  }
  const escaped = escapeLike(key);

  const prefixRows = await db
    .select({ id: patients.id, fullName: patients.fullName })
    .from(patients)
    .where(like(patients.nameKey, `${escaped}%`))
    .orderBy(asc(patients.nameKey))
    .limit(limit);

  let rows = prefixRows;
  if (prefixRows.length < limit) {
    const containsRows = await db
      .select({ id: patients.id, fullName: patients.fullName })
      .from(patients)
      .where(
        and(
          like(patients.nameKey, `%${escaped}%`),
          prefixRows.length > 0
            ? notInArray(
                patients.id,
                prefixRows.map((row) => row.id),
              )
            : undefined,
        ),
      )
      .orderBy(asc(patients.nameKey))
      .limit(limit - prefixRows.length);
    rows = [...prefixRows, ...containsRows];
  }

  return withVisitStats(rows);
}

/** Exact (normalized) name lookup — what decides "known patient or not". */
export async function lookupPatientByName(name: string): Promise<PatientSummary | undefined> {
  const key = normalizeNameKey(name);
  if (!key) {
    return undefined;
  }
  const [row] = await db
    .select({ id: patients.id, fullName: patients.fullName })
    .from(patients)
    .where(eq(patients.nameKey, key))
    .limit(1);
  if (!row) {
    return undefined;
  }
  const [summary] = await withVisitStats([row]);
  return summary;
}

/**
 * Finds the patient with this name, creating them if they're new. Called on
 * every transaction save, so the patients list fills itself in from the
 * names staff actually type. Returns `undefined` for a blank name.
 */
export async function getOrCreatePatientByName(
  rawName: string,
): Promise<{ id: string; fullName: string } | undefined> {
  const fullName = cleanDisplayName(rawName);
  const key = normalizeNameKey(rawName);
  if (!key) {
    return undefined;
  }

  const [existing] = await db
    .select({ id: patients.id, fullName: patients.fullName })
    .from(patients)
    .where(eq(patients.nameKey, key))
    .limit(1);
  if (existing) {
    return existing;
  }

  // A concurrent save of the same new name loses the unique-index race;
  // on conflict, just read the winner's row back.
  const [inserted] = await db
    .insert(patients)
    .values({ fullName, nameKey: key })
    .onConflictDoNothing({ target: patients.nameKey })
    .returning({ id: patients.id, fullName: patients.fullName });
  if (inserted) {
    return inserted;
  }

  const [afterConflict] = await db
    .select({ id: patients.id, fullName: patients.fullName })
    .from(patients)
    .where(eq(patients.nameKey, key))
    .limit(1);
  return afterConflict;
}

/**
 * Batch version for CSV imports: one insert + one lookup per 200 distinct
 * names instead of a round trip per row. Returns name key -> patient id.
 */
export async function getOrCreatePatientsByNames(rawNames: string[]): Promise<Map<string, string>> {
  const byKey = new Map<string, string>();
  for (const raw of rawNames) {
    const key = normalizeNameKey(raw);
    if (key && !byKey.has(key)) {
      byKey.set(key, cleanDisplayName(raw));
    }
  }
  const keys = [...byKey.keys()];
  const result = new Map<string, string>();
  if (keys.length === 0) {
    return result;
  }

  for (let i = 0; i < keys.length; i += CHUNK) {
    const chunk = keys.slice(i, i + CHUNK);
    await db
      .insert(patients)
      .values(chunk.map((key) => ({ fullName: byKey.get(key) as string, nameKey: key })))
      .onConflictDoNothing({ target: patients.nameKey });

    const found = await db
      .select({ id: patients.id, nameKey: patients.nameKey })
      .from(patients)
      .where(inArray(patients.nameKey, chunk));
    for (const row of found) {
      result.set(row.nameKey, row.id);
    }
  }
  return result;
}

/**
 * Earliest recorded VISIT date per patient (reservations don't count — a
 * reservation fee is not yet a visit). `excludeInvoiceIds` leaves out the
 * invoices being re-saved, so a visit never makes itself "returning".
 */
export async function getFirstVisitDates(
  patientIds: string[],
  excludeInvoiceIds: string[] = [],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const ids = [...new Set(patientIds)];

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const rows = await db
      .select({
        patientId: invoices.patientId,
        firstVisit: sql<string>`min(${invoices.visitDate})`,
      })
      .from(invoices)
      .where(
        and(
          inArray(invoices.patientId, chunk),
          eq(invoices.transactionType, "Visit"),
          excludeInvoiceIds.length > 0 ? notInArray(invoices.id, excludeInvoiceIds) : undefined,
        ),
      )
      .groupBy(invoices.patientId);
    for (const row of rows) {
      if (row.patientId) {
        result.set(row.patientId, row.firstVisit);
      }
    }
  }
  return result;
}

/**
 * NEW or RETURNING for a visit on `visitDate`. Returning means the patient
 * has an EARLIER visit on file (a zero-amount follow-up counts, a
 * reservation fee doesn't). Computed here so staff never have to remember
 * who has been before; the form lets them override it.
 */
export async function computeVisitType(
  patientId: string | null | undefined,
  visitDate: string,
  excludeInvoiceId?: string,
): Promise<"NEW" | "RETURNING"> {
  if (!patientId) {
    return "NEW";
  }
  const first = await getFirstVisitDates([patientId], excludeInvoiceId ? [excludeInvoiceId] : []);
  const date = first.get(patientId);
  return date && date < visitDate ? "RETURNING" : "NEW";
}
