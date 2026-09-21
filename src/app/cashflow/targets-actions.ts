"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { setSalesTarget } from "@/lib/db/targets";
import type { TargetPeriodType } from "@/lib/db/schema";

type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * Admin sets the sales target manually per period (see the architecture
 * note on the `sales_targets` table in schema.ts) — there's no automatic
 * target computation. `periodKey` must match the format the dashboard's
 * own period math produces (see `currentPeriodKeys` in
 * dashboard-metrics.ts), since that's what the dashboard looks the target
 * back up by.
 */
export async function setSalesTargetAction(
  periodType: TargetPeriodType,
  periodKey: string,
  targetAmount: number,
): Promise<ActionResult> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { ok: false, message: "Only admins can set sales targets." };
  }

  if (!Number.isFinite(targetAmount) || targetAmount < 0) {
    return { ok: false, message: "Target must be zero or a positive amount." };
  }

  await setSalesTarget({ periodType, periodKey, targetAmount });
  revalidatePath("/cashflow");
  return { ok: true };
}
