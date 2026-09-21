import { and, eq, ilike, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import type { PublicUser } from "@/lib/db/users";

const DENTIST_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  branchId: users.branchId,
  createdAt: users.createdAt,
} as const;

/** Dentist-role accounts only — used to populate the Dentist dropdown on
 * the transaction form and the dentist picker on the Commissions page. */
export async function listDentistUsers(): Promise<PublicUser[]> {
  return db
    .select(DENTIST_COLUMNS)
    .from(users)
    .where(eq(users.role, "dentist"))
    .orderBy(users.name);
}

/**
 * Dentist- and staff-role accounts — the pool eligible for a commission
 * rate under `dentist_commission_rates` (see that table's doc comment: the
 * rate mechanism is role-agnostic by design, reused as-is for staff
 * bonuses rather than adding a parallel schema). Powers the Commissions
 * admin page's user picker, which sets rates for dentists (their
 * per-procedure commission) and staff (their bonus rate) alike.
 */
export async function listCommissionEligibleUsers(): Promise<PublicUser[]> {
  return db
    .select(DENTIST_COLUMNS)
    .from(users)
    .where(inArray(users.role, ["dentist", "staff"]))
    .orderBy(users.name);
}

/** Staff-role accounts only — the picker for the staff bonus filter on
 * the Performance page. */
export async function listStaffUsers(): Promise<PublicUser[]> {
  return db
    .select(DENTIST_COLUMNS)
    .from(users)
    .where(eq(users.role, "staff"))
    .orderBy(users.name);
}

/**
 * Best-effort match from a free-text dentist name (as it appears in a CSV
 * export) to a real dentist account, by exact name match (case-insensitive,
 * whitespace-trimmed — `ilike` with no wildcards). Deliberately NOT fuzzy:
 * this drives commission attribution, so an unmatched name is left
 * unlinked rather than guessed at. Compound CSV entries like
 * "AHMAD/RUFINO" (two dentists on one line) won't match anything and stay
 * unlinked — that's expected, not a bug.
 */
export async function findDentistUserByName(
  rawName: string,
): Promise<PublicUser | undefined> {
  const name = rawName.trim();
  if (!name) {
    return undefined;
  }

  const [match] = await db
    .select(DENTIST_COLUMNS)
    .from(users)
    .where(and(eq(users.role, "dentist"), ilike(users.name, name)))
    .limit(1);
  return match;
}
