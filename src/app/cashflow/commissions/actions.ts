"use server";

import type { Session } from "next-auth";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import {
  describeTierRate,
  isCommissionTier,
  tierLabel,
} from "@/lib/cashflow/commission-tiers";
import { round2 } from "@/lib/cashflow/pricing";
import type { AuditChange } from "@/lib/cashflow/audit-diff";
import { logAudit } from "@/lib/db/audit";
import {
  deleteCommissionRate,
  findCommissionRate,
  setCommissionRate,
} from "@/lib/db/commission-rates";
import {
  clearIndividualRatesForTieredDentists,
  deleteTierRate,
  findTierRate,
  getDentistTierMap,
  listIndividualRatesOfTieredDentists,
  setDentistTier,
  setTierRate,
} from "@/lib/db/commission-tiers";
import {
  recalculateCommissions,
  type RecalcResult,
  type RecalcScope,
} from "@/lib/db/commission-recalc";
import { getUserById } from "@/lib/db/users";
import { getProcedureById } from "@/lib/db/procedures";

type ActionResult =
  | { ok: true; notice?: string }
  | { ok: false; message: string };

type Actor = { userId: string | null; name: string };

async function requireManager(): Promise<
  { ok: true; actor: Actor } | { ok: false; message: string }
> {
  const guard = await requirePermission(
    "commission.manage",
    "You don't have permission to edit commission rates.",
  );
  if (!guard.ok) return guard;
  return { ok: true, actor: actorOf(guard.session) };
}

function actorOf(session: Session): Actor {
  return {
    userId: session.user.id,
    name: session.user.name ?? session.user.email ?? "Someone",
  };
}

function revalidate() {
  revalidatePath("/cashflow/commissions");
  revalidatePath("/cashflow/commissions/report");
  revalidatePath("/cashflow/performance");
  revalidatePath("/cashflow/transactions");
}

type RateText = {
  ratePercent: number;
  hmoRatePercent: number | null;
  pesoValue?: number | null;
  hmoPesoValue: number | null;
};

function rateText(rate: RateText | undefined): string {
  if (!rate) return "none";
  return describeTierRate({
    ratePercent: rate.ratePercent,
    hmoRatePercent: rate.hmoRatePercent,
    pesoValue: rate.pesoValue ?? null,
    hmoPesoValue: rate.hmoPesoValue,
  });
}

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

/** "Commission updated on 12 saved lines (+₱340.00 in total)." */
function recalcNotice(result: RecalcResult): string {
  if (result.changed === 0) {
    return "Saved. No saved visit's commission changed.";
  }
  const sign = result.difference > 0 ? "+" : result.difference < 0 ? "−" : "";
  return `Saved. Commission updated on ${result.changed} saved line${
    result.changed === 1 ? "" : "s"
  } (${sign}${peso.format(Math.abs(result.difference))} in total).`;
}

function recalcSummary(result: RecalcResult): string {
  return result.changed === 0
    ? "no saved line changed"
    : `${result.changed} saved line${result.changed === 1 ? "" : "s"} recalculated (${
        result.difference >= 0 ? "+" : "−"
      }${peso.format(Math.abs(result.difference))})`;
}

/**
 * Applies a rate change to every saved visit (checked and approved ones
 * included, clinic decision November 2026). A failure here never undoes the
 * rate change: the person is told to press "Recalculate all".
 */
async function recalc(scope: RecalcScope): Promise<RecalcResult | null> {
  try {
    return await recalculateCommissions(scope);
  } catch (error) {
    console.error("Couldn't recalculate commissions", error);
    return null;
  }
}

function noticeFor(result: RecalcResult | null): string {
  return result
    ? recalcNotice(result)
    : "Saved, but saved visits could not be updated. Press Recalculate all commissions.";
}

async function nameOfUser(id: string): Promise<string> {
  return (await getUserById(id))?.name ?? "a person";
}

async function nameOfProcedure(id: string): Promise<string> {
  return (await getProcedureById(id))?.name ?? "a procedure";
}

function validPercent(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value >= 0 && value <= 100);
}

function validPeso(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value >= 0);
}

export async function setCommissionRateAction(input: {
  dentistUserId: string;
  procedureId: string;
  ratePercent: number;
  hmoRatePercent: number | null;
  hmoPesoValue: number | null;
}): Promise<ActionResult> {
  const guard = await requireManager();
  if (!guard.ok) return guard;

  if (!input.dentistUserId || !input.procedureId) {
    return { ok: false, message: "Select a dentist and a procedure." };
  }
  if (!validPercent(input.ratePercent) || input.ratePercent === null) {
    return { ok: false, message: "Rate must be between 0 and 100." };
  }
  if (!validPercent(input.hmoRatePercent)) {
    return { ok: false, message: "HMO rate must be between 0 and 100." };
  }
  if (!validPeso(input.hmoPesoValue)) {
    return { ok: false, message: "HMO peso value can't be negative." };
  }

  const before = await findCommissionRate({
    dentistUserId: input.dentistUserId,
    procedureId: input.procedureId,
  });
  await setCommissionRate(input.dentistUserId, input.procedureId, {
    ratePercent: input.ratePercent,
    hmoRatePercent: input.hmoRatePercent,
    hmoPesoValue: input.hmoPesoValue,
  });
  const result = await recalc({ dentistUserIds: [input.dentistUserId] });

  const [dentist, procedure] = await Promise.all([
    before?.dentistName ?? nameOfUser(input.dentistUserId),
    before?.procedureName ?? nameOfProcedure(input.procedureId),
  ]);
  const after = rateText({ ...input, pesoValue: null });
  await logAudit({
    action: "commission.rate_set",
    entityType: "commission",
    entityId: `${input.dentistUserId}:${input.procedureId}`,
    summary: `${guard.actor.name} set ${dentist}'s own rate for ${procedure}: ${rateText(before)} → ${after}${result ? ` · ${recalcSummary(result)}` : ""}`,
    changes: [{ field: `${dentist} · ${procedure}`, from: rateText(before), to: after }],
    actor: guard.actor,
  });
  revalidate();
  return { ok: true, notice: noticeFor(result) };
}

export async function deleteCommissionRateAction(id: string): Promise<ActionResult> {
  const guard = await requireManager();
  if (!guard.ok) return guard;

  const before = await findCommissionRate({ id });
  await deleteCommissionRate(id);
  const result = before ? await recalc({ dentistUserIds: [before.dentistUserId] }) : null;
  if (before) {
    await logAudit({
      action: "commission.rate_removed",
      entityType: "commission",
      entityId: `${before.dentistUserId}:${before.procedureId}`,
      summary: `${guard.actor.name} removed ${before.dentistName}'s own rate for ${before.procedureName} (was ${rateText(before)}; the tier rate applies)${result ? ` · ${recalcSummary(result)}` : ""}`,
      changes: [
        { field: `${before.dentistName} · ${before.procedureName}`, from: rateText(before), to: "tier rate" },
      ],
      actor: guard.actor,
    });
  }
  revalidate();
  return { ok: true, notice: before ? noticeFor(result) : undefined };
}

export async function setDentistTierAction(input: {
  dentistUserId: string;
  tier: number | null;
}): Promise<ActionResult> {
  const guard = await requireManager();
  if (!guard.ok) return guard;
  if (!input.dentistUserId) {
    return { ok: false, message: "Select a dentist." };
  }
  if (input.tier !== null && !isCommissionTier(input.tier)) {
    return { ok: false, message: "Tier must be 1, 2 or 3." };
  }

  const beforeTier = (await getDentistTierMap()).get(input.dentistUserId) ?? null;
  await setDentistTier(input.dentistUserId, input.tier);
  const result = await recalc({ dentistUserIds: [input.dentistUserId] });

  const dentist = await nameOfUser(input.dentistUserId);
  const fromText = beforeTier === null ? "no tier" : tierLabel(beforeTier);
  const toText = input.tier === null ? "no tier" : tierLabel(input.tier);
  if (fromText !== toText) {
    await logAudit({
      action: "commission.tier_assigned",
      entityType: "commission",
      entityId: input.dentistUserId,
      summary: `${guard.actor.name} moved ${dentist} from ${fromText} to ${toText}${result ? ` · ${recalcSummary(result)}` : ""}`,
      changes: [{ field: `${dentist} · tier`, from: fromText, to: toText }],
      actor: guard.actor,
    });
  }
  revalidate();
  return { ok: true, notice: noticeFor(result) };
}

/**
 * Sets one procedure's rate for one tier, or for several tiers at once
 * (the clinic's sheet often gives Tier 1 and Tier 2 the same rate).
 */
export async function setTierRateAction(input: {
  tiers: number[];
  procedureId: string;
  ratePercent: number;
  hmoRatePercent: number | null;
  pesoValue: number | null;
  hmoPesoValue: number | null;
}): Promise<ActionResult> {
  const guard = await requireManager();
  if (!guard.ok) return guard;
  if (!input.procedureId) {
    return { ok: false, message: "Select a procedure." };
  }
  if (input.tiers.length === 0 || !input.tiers.every(isCommissionTier)) {
    return { ok: false, message: "Select at least one tier (1, 2 or 3)." };
  }
  if (!validPercent(input.ratePercent) || input.ratePercent === null) {
    return { ok: false, message: "Rate must be between 0 and 100." };
  }
  if (!validPercent(input.hmoRatePercent)) {
    return { ok: false, message: "HMO rate must be between 0 and 100." };
  }
  if (!validPeso(input.pesoValue) || !validPeso(input.hmoPesoValue)) {
    return { ok: false, message: "Peso values can't be negative." };
  }

  const tiers = [...new Set(input.tiers)];
  const changes: AuditChange[] = [];
  let procedure = "";
  for (const tier of tiers) {
    const before = await findTierRate({ tier, procedureId: input.procedureId });
    await setTierRate(tier, input.procedureId, {
      ratePercent: input.ratePercent,
      hmoRatePercent: input.hmoRatePercent,
      pesoValue: input.pesoValue,
      hmoPesoValue: input.hmoPesoValue,
    });
    procedure ||= before?.procedureName ?? "";
    changes.push({ field: tierLabel(tier), from: rateText(before), to: rateText(input) });
  }
  procedure ||= await nameOfProcedure(input.procedureId);
  const result = await recalc({ procedureIds: [input.procedureId] });

  await logAudit({
    action: "commission.tier_rate_set",
    entityType: "commission",
    entityId: input.procedureId,
    summary: `${guard.actor.name} set ${procedure} for ${tiers.map(tierLabel).join(", ")}: ${changes
      .map((change) => `${change.from} → ${change.to}`)
      .join("; ")}${result ? ` · ${recalcSummary(result)}` : ""}`,
    changes: changes.map((change) => ({ ...change, field: `${procedure} · ${change.field}` })),
    actor: guard.actor,
  });
  revalidate();
  return { ok: true, notice: noticeFor(result) };
}

export async function deleteTierRateAction(id: string): Promise<ActionResult> {
  const guard = await requireManager();
  if (!guard.ok) return guard;

  const before = await findTierRate({ id });
  await deleteTierRate(id);
  const result = before ? await recalc({ procedureIds: [before.procedureId] }) : null;
  if (before) {
    await logAudit({
      action: "commission.tier_rate_removed",
      entityType: "commission",
      entityId: before.procedureId,
      summary: `${guard.actor.name} removed the ${tierLabel(before.tier)} rate for ${before.procedureName} (was ${rateText(before)})${result ? ` · ${recalcSummary(result)}` : ""}`,
      changes: [
        { field: `${before.procedureName} · ${tierLabel(before.tier)}`, from: rateText(before), to: "none" },
      ],
      actor: guard.actor,
    });
  }
  revalidate();
  return { ok: true, notice: before ? noticeFor(result) : undefined };
}

/** Drops every individual rate of dentists that have a tier. */
export async function clearIndividualRatesAction(): Promise<
  { ok: true; removed: number; notice?: string } | { ok: false; message: string }
> {
  const guard = await requireManager();
  if (!guard.ok) return guard;

  const going = await listIndividualRatesOfTieredDentists();
  const removed = await clearIndividualRatesForTieredDentists();
  const dentistIds = [...new Set(going.map((rate) => rate.dentistUserId))];
  const result = removed > 0 ? await recalc({ dentistUserIds: dentistIds }) : null;
  if (removed > 0) {
    await logAudit({
      action: "commission.rates_cleared",
      entityType: "commission",
      summary: `${guard.actor.name} removed ${removed} own rate${removed === 1 ? "" : "s"} from dentists who have a tier (${[
        ...new Set(going.map((rate) => rate.dentistName)),
      ].join(", ")})${result ? ` · ${recalcSummary(result)}` : ""}`,
      // The removed values, so they can be put back by hand if needed.
      changes: going.map((rate) => ({
        field: `${rate.dentistName} · ${rate.procedureName}`,
        from: rateText({ ...rate, pesoValue: null }),
        to: "tier rate",
      })),
      actor: guard.actor,
    });
  }
  revalidate();
  return { ok: true, removed, notice: removed > 0 ? noticeFor(result) : undefined };
}

/**
 * Works out every saved line's commission again from today's rates. For
 * after a fix done outside the Commissions page (SQL, a renamed procedure)
 * and once after installing this version.
 */
export async function recalculateAllCommissionsAction(): Promise<ActionResult> {
  const guard = await requireManager();
  if (!guard.ok) return guard;

  const result = await recalc({});
  if (!result) {
    return { ok: false, message: "The commissions could not be recalculated. Try again." };
  }
  await logAudit({
    action: "commission.recalculated",
    entityType: "commission",
    summary: `${guard.actor.name} recalculated every saved commission: ${result.lines} line${
      result.lines === 1 ? "" : "s"
    } checked, ${recalcSummary(result)}${
      result.linked > 0 ? `, ${result.linked} linked to their procedure` : ""
    }`,
    actor: guard.actor,
  });
  revalidate();
  return {
    ok: true,
    notice:
      result.changed === 0
        ? `Every commission is already up to date (${result.lines} lines checked).`
        : `Recalculated ${result.lines} lines: ${result.changed} changed (${
            result.difference >= 0 ? "+" : "−"
          }${peso.format(Math.abs(round2(result.difference)))} in total).`,
  };
}
