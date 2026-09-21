import { ilike } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { procedures, type ProcedureRow } from "@/lib/db/schema";

export async function listProcedures(): Promise<ProcedureRow[]> {
  return db.select().from(procedures).orderBy(procedures.name);
}

/**
 * Looks up a procedure by name (case-insensitive, trimmed) and creates it
 * if it doesn't exist yet. Called for every transaction save (manual add,
 * edit, or CSV import) so the `procedures` table fills in organically from
 * whatever procedure names actually show up, instead of needing to be
 * pre-populated by an admin.
 *
 * Returns `undefined` for a blank name (nothing to link).
 */
export async function getOrCreateProcedureByName(
  rawName: string,
): Promise<ProcedureRow | undefined> {
  const name = rawName.trim();
  if (!name) {
    return undefined;
  }

  const [existing] = await db
    .select()
    .from(procedures)
    .where(ilike(procedures.name, name))
    .limit(1);
  if (existing) {
    return existing;
  }

  // Two concurrent saves for a brand-new procedure name could both miss the
  // lookup above and both try to insert — the `name` unique constraint
  // means the second insert fails, so fall back to re-reading on conflict
  // rather than erroring the whole save.
  const [inserted] = await db
    .insert(procedures)
    .values({ name })
    .onConflictDoNothing({ target: procedures.name })
    .returning();
  if (inserted) {
    return inserted;
  }

  const [afterConflict] = await db
    .select()
    .from(procedures)
    .where(ilike(procedures.name, name))
    .limit(1);
  return afterConflict;
}
