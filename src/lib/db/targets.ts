import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { salesTargets, type SalesTargetRow, type TargetPeriodType } from "@/lib/db/schema";

export type SalesTarget = {
  id: string;
  periodType: TargetPeriodType;
  periodKey: string;
  targetAmount: number;
  createdAt: Date;
  updatedAt: Date;
};

function toAppTarget(row: SalesTargetRow): SalesTarget {
  return { ...row, targetAmount: Number(row.targetAmount) };
}

/**
 * The admin-set sales target for one period (e.g. periodType "month",
 * periodKey "2026-09"). `periodKey` follows the same format the dashboard
 * already uses for each granularity — "2026-09" (month), "2026-Q3"
 * (quarter), "2026" (year) — so a target row lines up directly with the
 * dashboard's period buckets without any reformatting.
 */
export async function getSalesTarget(
  periodType: TargetPeriodType,
  periodKey: string,
): Promise<SalesTarget | undefined> {
  const [row] = await db
    .select()
    .from(salesTargets)
    .where(and(eq(salesTargets.periodType, periodType), eq(salesTargets.periodKey, periodKey)))
    .limit(1);
  return row ? toAppTarget(row) : undefined;
}

/**
 * Creates or updates the target for a period (admin sets it manually — see
 * the architecture note in schema.ts). Upserts on the
 * (period_type, period_key) unique constraint so setting a target twice
 * for the same period updates it in place rather than erroring.
 */
export async function setSalesTarget(input: {
  periodType: TargetPeriodType;
  periodKey: string;
  targetAmount: number;
}): Promise<SalesTarget> {
  const [row] = await db
    .insert(salesTargets)
    .values({
      periodType: input.periodType,
      periodKey: input.periodKey,
      targetAmount: input.targetAmount.toString(),
    })
    .onConflictDoUpdate({
      target: [salesTargets.periodType, salesTargets.periodKey],
      set: {
        targetAmount: input.targetAmount.toString(),
        updatedAt: new Date(),
      },
    })
    .returning();
  return toAppTarget(row);
}

export async function deleteSalesTarget(id: string): Promise<void> {
  await db.delete(salesTargets).where(eq(salesTargets.id, id));
}
