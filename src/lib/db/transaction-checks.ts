import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoices, transactionChecks, transactionHqChecks, transactions } from "@/lib/db/schema";
import { isCheckInPlaceholder } from "@/lib/cashflow/visit-status";
import {
  canApproveVisitHq,
  canCheckVisit,
  checkStateOf,
  isVisitLocked,
  lockedMessageFor,
  NO_CHECK,
  type VisitCheck,
} from "@/lib/cashflow/transaction-lock";
import { logAudit } from "@/lib/db/audit";

export const CHECKS_NOT_READY =
  "Checking transactions needs one more step first: run scripts/sql/2026-11-transaction-checks.sql in Neon, then try again.";

export const HQ_CHECKS_NOT_READY =
  "The Headquarters check needs one more step first: run scripts/sql/2026-11-transaction-hq-checks.sql in Neon, then try again.";

let warned = false;
let hqWarned = false;

/** The `transaction_hq_checks` table doesn't exist yet (its SQL script wasn't run). */
export function hqChecksSchemaMissing(error: unknown): boolean {
  const text = String(error) + String((error as { cause?: unknown })?.cause ?? "");
  const missing = /transaction_hq_checks/.test(text) && /does not exist|relation/.test(text);
  if (missing && !hqWarned) {
    hqWarned = true;
    console.warn(
      "The Headquarters check is off: run scripts/sql/2026-11-transaction-hq-checks.sql.",
    );
  }
  return missing;
}

/** Is the Headquarters table there? (False until its SQL script has been run.) */
export async function hqChecksReady(): Promise<boolean> {
  try {
    await db
      .select({ id: transactionHqChecks.transactionId })
      .from(transactionHqChecks)
      .limit(1);
    return true;
  } catch (error) {
    if (hqChecksSchemaMissing(error)) return false;
    throw error;
  }
}

/** The `transaction_checks` table doesn't exist yet (the SQL script wasn't run). */
export function checksSchemaMissing(error: unknown): boolean {
  const text = String(error) + String((error as { cause?: unknown })?.cause ?? "");
  const missing = /transaction_checks/.test(text) && /does not exist|relation/.test(text);
  if (missing && !warned) {
    warned = true;
    console.warn(
      "Transaction checks are off: run scripts/sql/2026-11-transaction-checks.sql.",
    );
  }
  return missing;
}

/** Is the checks table there? (False until the SQL script has been run.) */
export async function transactionChecksReady(): Promise<boolean> {
  try {
    await db.select({ id: transactionChecks.transactionId }).from(transactionChecks).limit(1);
    return true;
  } catch (error) {
    if (checksSchemaMissing(error)) return false;
    throw error;
  }
}

/**
 * Per visit: how many procedure lines it has, how many are checked, and who
 * checked last and when. A visit with no entry has nothing checked. Returns
 * an empty record while the table is missing, so the app works before the SQL
 * script is run.
 */
export async function getVisitChecks(
  invoiceIds: readonly string[],
): Promise<Record<string, VisitCheck>> {
  const result: Record<string, VisitCheck> = {};
  const ids = [...new Set(invoiceIds)];
  if (ids.length === 0) return result;
  try {
    const rows = await db
      .select({
        invoiceId: transactions.invoiceId,
        id: transactions.id,
        procedure: transactions.procedure,
        checkedAt: transactionChecks.checkedAt,
        checkedBy: transactionChecks.checkedByName,
        checkedByUserId: transactionChecks.checkedByUserId,
      })
      .from(transactions)
      .leftJoin(transactionChecks, eq(transactionChecks.transactionId, transactions.id))
      .where(inArray(transactions.invoiceId, ids));
    for (const row of rows) {
      if (!row.invoiceId || isCheckInPlaceholder(row.procedure)) continue;
      const entry = (result[row.invoiceId] ??= { ...NO_CHECK });
      entry.lines += 1;
      if (row.checkedAt) {
        entry.checked += 1;
        const at = row.checkedAt.toISOString();
        if (!entry.checkedAt || at > entry.checkedAt) {
          entry.checkedAt = at;
          entry.checkedBy = row.checkedBy ?? "";
          entry.checkedByUserId = row.checkedByUserId ?? null;
        }
      }
    }
  } catch (error) {
    if (checksSchemaMissing(error)) return {};
    throw error;
  }

  // The Headquarters check, in its own table (missing until its SQL script is
  // run: then every visit simply has no Headquarters check).
  try {
    const hqRows = await db
      .select({
        invoiceId: transactions.invoiceId,
        procedure: transactions.procedure,
        checkedAt: transactionHqChecks.checkedAt,
        checkedBy: transactionHqChecks.checkedByName,
      })
      .from(transactions)
      .innerJoin(transactionHqChecks, eq(transactionHqChecks.transactionId, transactions.id))
      .where(inArray(transactions.invoiceId, ids));
    for (const row of hqRows) {
      if (!row.invoiceId || isCheckInPlaceholder(row.procedure)) continue;
      const entry = result[row.invoiceId];
      if (!entry) continue;
      entry.hqChecked += 1;
      const at = row.checkedAt.toISOString();
      if (!entry.hqCheckedAt || at > entry.hqCheckedAt) {
        entry.hqCheckedAt = at;
        entry.hqCheckedBy = row.checkedBy ?? "";
      }
    }
  } catch (error) {
    if (!hqChecksSchemaMissing(error)) throw error;
  }
  return result;
}

/**
 * The sentence to hand back when this visit is locked and the person is not
 * the superuser; null when the action may go ahead. `action` names what was
 * attempted ("edit", "remove", "record a payment", ...).
 */
export async function visitLockMessage(
  invoiceId: string | null | undefined,
  actor: { isSuperuser: boolean },
  action: string,
): Promise<string | null> {
  if (!invoiceId || actor.isSuperuser) return null;
  const check = (await getVisitChecks([invoiceId]))[invoiceId];
  return isVisitLocked(check) ? lockedMessageFor(action) : null;
}

/** Same, starting from one transaction line's id. */
export async function lineLockMessage(
  lineId: string,
  actor: { isSuperuser: boolean },
  action: string,
): Promise<string | null> {
  if (actor.isSuperuser) return null;
  const [line] = await db
    .select({ invoiceId: transactions.invoiceId })
    .from(transactions)
    .where(eq(transactions.id, lineId))
    .limit(1);
  if (!line) return null;
  if (line.invoiceId) return visitLockMessage(line.invoiceId, actor, action);
  try {
    const [row] = await db
      .select({ id: transactionChecks.transactionId })
      .from(transactionChecks)
      .where(eq(transactionChecks.transactionId, lineId))
      .limit(1);
    return row ? lockedMessageFor(action) : null;
  } catch (error) {
    if (checksSchemaMissing(error)) return null;
    throw error;
  }
}

export type CheckActor = {
  userId: string | null;
  name: string;
  /** The clinics the person may check visits of; null = every clinic. */
  allowedBranchIds: string[] | null;
};

export type CheckResult =
  | { ok: true; checked: number; skipped: Array<{ invoiceId: string; reason: string }> }
  | { ok: false; message: string };

/**
 * Ticks visits as checked: each procedure line gets a check record and the
 * visit becomes locked. A visit that can't be checked (not Cleared, another
 * clinic's, already checked, ...) is skipped with its reason; the rest go
 * ahead. Written to the audit trail, one entry per visit.
 */
export async function checkVisits(
  invoiceIds: readonly string[],
  actor: CheckActor,
): Promise<CheckResult> {
  const ids = [...new Set(invoiceIds)];
  if (ids.length === 0) return { ok: false, message: "Nothing was selected." };
  if (ids.length > 200) {
    return { ok: false, message: "Check up to 200 visits at a time." };
  }
  if (!(await transactionChecksReady())) {
    return { ok: false, message: CHECKS_NOT_READY };
  }

  const [headers, lines, existing] = await Promise.all([
    db.select().from(invoices).where(inArray(invoices.id, ids)),
    db
      .select({
        id: transactions.id,
        invoiceId: transactions.invoiceId,
        procedure: transactions.procedure,
        patientName: transactions.patientName,
        amountPaid: transactions.amountPaid,
      })
      .from(transactions)
      .where(inArray(transactions.invoiceId, ids)),
    getVisitChecks(ids),
  ]);
  const headerById = new Map(headers.map((header) => [header.id, header]));
  const skipped: Array<{ invoiceId: string; reason: string }> = [];
  let checked = 0;

  for (const invoiceId of ids) {
    const header = headerById.get(invoiceId);
    if (!header) {
      skipped.push({ invoiceId, reason: "That visit no longer exists." });
      continue;
    }
    if (
      actor.allowedBranchIds !== null &&
      !(header.branchId && actor.allowedBranchIds.includes(header.branchId))
    ) {
      skipped.push({ invoiceId, reason: "It belongs to another clinic." });
      continue;
    }
    const visitLines = lines.filter(
      (line) => line.invoiceId === invoiceId && !isCheckInPlaceholder(line.procedure),
    );
    const decision = canCheckVisit({
      status: header.status,
      procedures: visitLines.map((line) => line.procedure),
      state: checkStateOf(existing[invoiceId] ?? NO_CHECK),
    });
    if (!decision.ok) {
      skipped.push({ invoiceId, reason: decision.reason });
      continue;
    }
    await db
      .insert(transactionChecks)
      .values(
        visitLines.map((line) => ({
          transactionId: line.id,
          checkedByUserId: actor.userId,
          checkedByName: actor.name,
        })),
      )
      .onConflictDoNothing();
    checked += 1;
    const total = visitLines.reduce((sum, line) => sum + Number(line.amountPaid), 0);
    await logAudit({
      action: "visit.checked",
      entityType: "invoice",
      entityId: invoiceId,
      invoiceId,
      patientId: header.patientId,
      summary: `${visitLines[0]?.patientName ?? "Visit"} of ${header.visitDate} · ${visitLines.length} ${visitLines.length === 1 ? "procedure" : "procedures"} · total ${total.toFixed(2)} · checked and locked`,
      actor: { userId: actor.userId, name: actor.name },
    });
  }
  return { ok: true, checked, skipped };
}

export type HqActor = {
  userId: string | null;
  name: string;
  isSuperuser: boolean;
  /** The clinics the person may check visits of; null = every clinic. */
  allowedBranchIds: string[] | null;
};

/**
 * Headquarters' approval: the second check, after the Branch manager's. Every
 * line of the visit gets a Headquarters record. A visit that can't be approved
 * (not checked by the branch yet, already approved, another clinic's, or the
 * person gave the Branch check themselves) is skipped with its reason; the
 * rest go ahead. One audit entry per visit.
 */
export async function approveVisitsHq(
  invoiceIds: readonly string[],
  actor: HqActor,
): Promise<CheckResult> {
  const ids = [...new Set(invoiceIds)];
  if (ids.length === 0) return { ok: false, message: "Nothing was selected." };
  if (ids.length > 200) {
    return { ok: false, message: "Approve up to 200 visits at a time." };
  }
  if (!(await transactionChecksReady())) {
    return { ok: false, message: CHECKS_NOT_READY };
  }
  if (!(await hqChecksReady())) {
    return { ok: false, message: HQ_CHECKS_NOT_READY };
  }

  const [headers, lines, existing] = await Promise.all([
    db.select().from(invoices).where(inArray(invoices.id, ids)),
    db
      .select({
        id: transactions.id,
        invoiceId: transactions.invoiceId,
        procedure: transactions.procedure,
        patientName: transactions.patientName,
        amountPaid: transactions.amountPaid,
      })
      .from(transactions)
      .where(inArray(transactions.invoiceId, ids)),
    getVisitChecks(ids),
  ]);
  const headerById = new Map(headers.map((header) => [header.id, header]));
  const skipped: Array<{ invoiceId: string; reason: string }> = [];
  let checked = 0;

  for (const invoiceId of ids) {
    const header = headerById.get(invoiceId);
    if (!header) {
      skipped.push({ invoiceId, reason: "That visit no longer exists." });
      continue;
    }
    if (
      actor.allowedBranchIds !== null &&
      !(header.branchId && actor.allowedBranchIds.includes(header.branchId))
    ) {
      skipped.push({ invoiceId, reason: "It belongs to another clinic." });
      continue;
    }
    const decision = canApproveVisitHq({
      check: existing[invoiceId] ?? NO_CHECK,
      actorUserId: actor.userId,
      isSuperuser: actor.isSuperuser,
    });
    if (!decision.ok) {
      skipped.push({ invoiceId, reason: decision.reason });
      continue;
    }
    const visitLines = lines.filter(
      (line) => line.invoiceId === invoiceId && !isCheckInPlaceholder(line.procedure),
    );
    await db
      .insert(transactionHqChecks)
      .values(
        visitLines.map((line) => ({
          transactionId: line.id,
          checkedByUserId: actor.userId,
          checkedByName: actor.name,
        })),
      )
      .onConflictDoNothing();
    checked += 1;
    const total = visitLines.reduce((sum, line) => sum + Number(line.amountPaid), 0);
    await logAudit({
      action: "visit.hq_checked",
      entityType: "invoice",
      entityId: invoiceId,
      invoiceId,
      patientId: header.patientId,
      summary: `${visitLines[0]?.patientName ?? "Visit"} of ${header.visitDate} · ${visitLines.length} ${visitLines.length === 1 ? "procedure" : "procedures"} · total ${total.toFixed(2)} · approved by Headquarters (Branch check by ${existing[invoiceId]?.checkedBy || "someone"})`,
      actor: { userId: actor.userId, name: actor.name },
    });
  }
  return { ok: true, checked, skipped };
}

export type UncheckResult = { ok: true } | { ok: false; message: string };

/** Unlocks a checked visit. Only the superuser may (enforced here too). */
export async function uncheckVisit(
  invoiceId: string,
  actor: { userId: string | null; name: string; isSuperuser: boolean },
): Promise<UncheckResult> {
  if (!actor.isSuperuser) {
    return { ok: false, message: "Only the superuser can unlock a checked visit." };
  }
  if (!(await transactionChecksReady())) {
    return { ok: false, message: CHECKS_NOT_READY };
  }
  const lineIds = (
    await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.invoiceId, invoiceId))
  ).map((line) => line.id);
  if (lineIds.length === 0) {
    return { ok: false, message: "That visit no longer exists." };
  }
  // Unlocking removes both checks. (The Headquarters table may not exist yet.)
  let hqRemoved = 0;
  try {
    hqRemoved = (
      await db
        .delete(transactionHqChecks)
        .where(inArray(transactionHqChecks.transactionId, lineIds))
        .returning({ id: transactionHqChecks.transactionId })
    ).length;
  } catch (error) {
    if (!hqChecksSchemaMissing(error)) throw error;
  }
  const removed = await db
    .delete(transactionChecks)
    .where(inArray(transactionChecks.transactionId, lineIds))
    .returning({ id: transactionChecks.transactionId });
  if (removed.length === 0) {
    return { ok: false, message: "That visit isn't checked." };
  }
  const [header] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  const [first] = await db
    .select({ patientName: transactions.patientName })
    .from(transactions)
    .where(eq(transactions.invoiceId, invoiceId))
    .limit(1);
  await logAudit({
    action: "visit.unchecked",
    entityType: "invoice",
    entityId: invoiceId,
    invoiceId,
    patientId: header?.patientId ?? null,
    summary: `${first?.patientName ?? "Visit"} of ${header?.visitDate ?? ""} · unlocked (check removed from ${removed.length} ${removed.length === 1 ? "line" : "lines"}${hqRemoved > 0 ? ", Headquarters approval removed too" : ""})`,
    actor: { userId: actor.userId, name: actor.name },
  });
  return { ok: true };
}

/** SQL fragment for the list filter: does this visit have a checked line? */
export function visitHasCheckSql() {
  return sql`exists (
    select 1 from ${transactionChecks} tc
    join ${transactions} t on t.id = tc.transaction_id
    where coalesce(t.invoice_id::text, t.id::text) = coalesce(${transactions.invoiceId}::text, ${transactions.id}::text)
  )`;
}

/** SQL fragment for the list filter: does this visit have a Headquarters-approved line? */
export function visitHasHqCheckSql() {
  return sql`exists (
    select 1 from ${transactionHqChecks} hc
    join ${transactions} t on t.id = hc.transaction_id
    where coalesce(t.invoice_id::text, t.id::text) = coalesce(${transactions.invoiceId}::text, ${transactions.id}::text)
  )`;
}

/** Does this patient have a checked (locked) visit? */
export async function patientHasCheckedLines(patientId: string): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: transactionChecks.transactionId })
      .from(transactionChecks)
      .innerJoin(transactions, eq(transactions.id, transactionChecks.transactionId))
      .where(eq(transactions.patientId, patientId))
      .limit(1);
    return rows.length > 0;
  } catch (error) {
    if (checksSchemaMissing(error)) return false;
    throw error;
  }
}

/** SQL fragment: this line has not been checked (so it may still be changed). */
export function lineNotCheckedSql() {
  return sql`not exists (select 1 from ${transactionChecks} tc where tc.transaction_id = ${transactions.id})`;
}
