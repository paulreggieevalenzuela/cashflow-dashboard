import { inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import {
  CHECK_IN_PLACEHOLDER,
  visitReadinessIssue,
} from "@/lib/cashflow/visit-status";

/**
 * For a batch of visits: why each can't go on to For Payment / Cleared yet
 * (no real procedure, or no dentist), or null when it can. Two counts from
 * one query; the check-in placeholder line is not a procedure.
 */
export async function getReadinessIssues(
  invoiceIds: string[],
): Promise<Map<string, string | null>> {
  const ids = [...new Set(invoiceIds)];
  const result = new Map<string, string | null>();
  if (ids.length === 0) {
    return result;
  }
  const rows = await db
    .select({
      invoiceId: transactions.invoiceId,
      procedureCount: sql<number>`count(*) filter (where ${transactions.procedure} <> ${CHECK_IN_PLACEHOLDER})::int`,
      hasDentist: sql<boolean>`coalesce(bool_or(btrim(${transactions.dentist}) <> ''), false)`,
    })
    .from(transactions)
    .where(inArray(transactions.invoiceId, ids))
    .groupBy(transactions.invoiceId);
  for (const row of rows) {
    if (!row.invoiceId) continue;
    result.set(
      row.invoiceId,
      visitReadinessIssue({
        procedureCount: row.procedureCount,
        hasDentist: row.hasDentist,
      }),
    );
  }
  return result;
}

export async function getReadinessIssue(
  invoiceId: string,
): Promise<string | null> {
  const map = await getReadinessIssues([invoiceId]);
  return map.get(invoiceId) ?? null;
}
