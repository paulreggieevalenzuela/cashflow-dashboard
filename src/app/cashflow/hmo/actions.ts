"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/access";
import { formatRange, rangeProblem } from "@/lib/cashflow/hmo-billing";
import { logAudit } from "@/lib/db/audit";
import { listBranches } from "@/lib/db/branches";
import { resolveDayEndScope } from "@/lib/db/day-end";
import {
  createHmoBilling,
  getHmoBilling,
  voidHmoBilling,
} from "@/lib/db/hmo-billing";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

function backToTab(
  fields: { hmo: string; branch: string; from: string; to: string },
  error: string,
): never {
  const query = new URLSearchParams({ ...fields, error });
  redirect(`/cashflow/hmo?${query.toString()}`);
}

/**
 * Generate billing: saves the previewed rows as a numbered billing and opens
 * it. The rows are read again on the server (nothing is taken from the
 * screen), a person who belongs to a branch can only bill that branch, and a
 * billing needs one branch (its number carries the branch code).
 */
export async function generateHmoBillingAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const fields = {
    hmo: String(formData.get("hmo") ?? ""),
    branch: String(formData.get("branch") ?? ""),
    from: String(formData.get("from") ?? ""),
    to: String(formData.get("to") ?? ""),
  };

  const problem = rangeProblem(fields.from, fields.to);
  if (problem) backToTab(fields, problem);

  const branchList = await listBranches();
  const scope = await resolveDayEndScope({
    userId: session.user.id,
    role: session.user.role,
    requested: fields.branch,
    branchList,
  });
  if (!scope.branchId) {
    backToTab(fields, "Pick one branch to generate a billing.");
  }

  const result = await createHmoBilling({
    hmo: fields.hmo,
    branchId: scope.branchId,
    from: fields.from,
    to: fields.to,
    actor: {
      userId: session.user.id,
      name: session.user.name ?? session.user.email ?? "",
    },
  });
  if (!result.ok) backToTab(fields, result.message);

  const { billing } = result;
  await logAudit({
    action: "hmo_billing.created",
    entityType: "hmo_billing",
    entityId: billing.id,
    summary: `HMO billing ${billing.billingNumber}: ${billing.hmo}, ${billing.branchName}, ${formatRange(billing.periodFrom, billing.periodTo)}, ${billing.lineCount} lines, ${peso.format(billing.totalAmount)}`,
    actor: {
      userId: session.user.id,
      name: session.user.name ?? session.user.email ?? "",
    },
  });
  revalidatePath("/cashflow/hmo");
  redirect(`/cashflow/hmo/${billing.id}`);
}

/** Void a billing (admin only): its lines can be billed again. */
export async function voidHmoBillingAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (session.user.role !== "admin") {
    redirect(`/cashflow/hmo/${id}?error=${encodeURIComponent("Only an admin can void a billing.")}`);
  }
  const saved = await getHmoBilling(id);
  if (!saved) redirect("/cashflow/hmo");

  const name = session.user.name ?? session.user.email ?? "";
  const result = await voidHmoBilling({ id, actorName: name });
  if (!result.ok) {
    redirect(`/cashflow/hmo/${id}?error=${encodeURIComponent(result.message)}`);
  }
  await logAudit({
    action: "hmo_billing.voided",
    entityType: "hmo_billing",
    entityId: id,
    summary: `HMO billing ${saved.billing.billingNumber} voided; its ${saved.billing.lineCount} lines can be billed again`,
    actor: { userId: session.user.id, name },
  });
  revalidatePath("/cashflow/hmo");
  redirect(`/cashflow/hmo/${id}`);
}
