"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/access";
import { getBranchPolicy } from "@/lib/auth/branch-policy";
import { requirePermission } from "@/lib/auth/guards";
import { approveVisitsHq, checkVisits, uncheckVisit } from "@/lib/db/transaction-checks";

export type CheckActionResult =
  | { ok: true; message: string; skipped: Array<{ invoiceId: string; reason: string }> }
  | { ok: false; message: string };

function revalidate() {
  revalidatePath("/cashflow/transactions", "layout");
  revalidatePath("/cashflow/queue");
  revalidatePath("/cashflow", "layout");
}

/**
 * The Branch manager's check (the first one): ticks visits as checked and
 * locks them. For people with the "Check transactions: Branch manager"
 * privilege (owners and admins by default), within their own clinics. A visit
 * has to be Cleared first.
 */
export async function checkVisitsAction(invoiceIds: string[]): Promise<CheckActionResult> {
  const guard = await requirePermission(
    "transaction.verify",
    "You don't have permission to check transactions as Branch manager.",
  );
  if (!guard.ok) return { ok: false, message: guard.message };
  const session = guard.session;
  const policy = await getBranchPolicy(session);

  const result = await checkVisits(Array.isArray(invoiceIds) ? invoiceIds.slice(0, 200) : [], {
    userId: session.user.id,
    name: session.user.name ?? session.user.email ?? "",
    allowedBranchIds: policy.allowedBranchIds,
  });
  if (!result.ok) return result;
  revalidate();
  const parts = [
    result.checked === 0
      ? "Nothing was checked."
      : `${result.checked} ${result.checked === 1 ? "visit" : "visits"} checked and locked.`,
  ];
  if (result.skipped.length > 0) {
    parts.push(
      `${result.skipped.length} skipped: ${[...new Set(result.skipped.map((item) => item.reason))].join(" ")}`,
    );
  }
  return { ok: result.checked > 0 || result.skipped.length === 0, message: parts.join(" "), skipped: result.skipped } as CheckActionResult;
}

/**
 * Headquarters' check (the second and last one). For people with the "Check
 * transactions: Headquarters" privilege. Only a visit the Branch manager has
 * already checked, and never by the person who gave that first check.
 */
export async function approveVisitsHqAction(invoiceIds: string[]): Promise<CheckActionResult> {
  const guard = await requirePermission(
    "transaction.verify_hq",
    "You don't have permission to check transactions as Headquarters.",
  );
  if (!guard.ok) return { ok: false, message: guard.message };
  const session = guard.session;
  const policy = await getBranchPolicy(session);

  const result = await approveVisitsHq(Array.isArray(invoiceIds) ? invoiceIds.slice(0, 200) : [], {
    userId: session.user.id,
    name: session.user.name ?? session.user.email ?? "",
    isSuperuser: Boolean(session.user.isSuperuser),
    allowedBranchIds: policy.allowedBranchIds,
  });
  if (!result.ok) return result;
  revalidate();
  const parts = [
    result.checked === 0
      ? "Nothing was approved."
      : `${result.checked} ${result.checked === 1 ? "visit" : "visits"} approved by Headquarters.`,
  ];
  if (result.skipped.length > 0) {
    parts.push(
      `${result.skipped.length} skipped: ${[...new Set(result.skipped.map((item) => item.reason))].join(" ")}`,
    );
  }
  return { ok: result.checked > 0 || result.skipped.length === 0, message: parts.join(" "), skipped: result.skipped } as CheckActionResult;
}

/** Unlocks a checked visit (removes both checks). Superuser only. */
export async function uncheckVisitAction(invoiceId: string): Promise<CheckActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "You must be signed in." };
  if (!session.user.isSuperuser) {
    return { ok: false, message: "Only the superuser can unlock a checked visit." };
  }
  const result = await uncheckVisit(invoiceId, {
    userId: session.user.id,
    name: session.user.name ?? session.user.email ?? "",
    isSuperuser: true,
  });
  if (!result.ok) return result;
  revalidate();
  return { ok: true, message: "Unlocked. The visit can be edited again.", skipped: [] };
}
