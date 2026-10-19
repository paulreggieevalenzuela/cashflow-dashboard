"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { isCommissionTier } from "@/lib/cashflow/commission-tiers";
import {
  deleteCommissionRate,
  setCommissionRate,
} from "@/lib/db/commission-rates";
import {
  clearIndividualRatesForTieredDentists,
  deleteTierRate,
  setDentistTier,
  setTierRate,
} from "@/lib/db/commission-tiers";

type ActionResult = { ok: true } | { ok: false; message: string };

async function requireAdmin(): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "You must be signed in." };
  }
  if (session.user.role !== "admin") {
    return { ok: false, message: "Only admins can manage commission rates." };
  }
  return { ok: true };
}

function revalidate() {
  revalidatePath("/cashflow/commissions");
  revalidatePath("/cashflow/performance");
}

export async function setCommissionRateAction(input: {
  dentistUserId: string;
  procedureId: string;
  ratePercent: number;
  hmoRatePercent: number | null;
  hmoPesoValue: number | null;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return guard;
  }

  if (!input.dentistUserId || !input.procedureId) {
    return { ok: false, message: "Select a dentist and a procedure." };
  }
  if (
    !Number.isFinite(input.ratePercent) ||
    input.ratePercent < 0 ||
    input.ratePercent > 100
  ) {
    return { ok: false, message: "Rate must be between 0 and 100." };
  }

  const hmoPercent = input.hmoRatePercent;
  if (
    hmoPercent !== null &&
    (!Number.isFinite(hmoPercent) || hmoPercent < 0 || hmoPercent > 100)
  ) {
    return { ok: false, message: "HMO rate must be between 0 and 100." };
  }
  const hmoPeso = input.hmoPesoValue;
  if (hmoPeso !== null && (!Number.isFinite(hmoPeso) || hmoPeso < 0)) {
    return { ok: false, message: "HMO peso value can't be negative." };
  }

  await setCommissionRate(input.dentistUserId, input.procedureId, {
    ratePercent: input.ratePercent,
    hmoRatePercent: hmoPercent,
    hmoPesoValue: hmoPeso,
  });
  revalidate();
  return { ok: true };
}

export async function deleteCommissionRateAction(
  id: string,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return guard;
  }

  await deleteCommissionRate(id);
  revalidate();
  return { ok: true };
}

export async function setDentistTierAction(input: {
  dentistUserId: string;
  tier: number | null;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return guard;
  }
  if (!input.dentistUserId) {
    return { ok: false, message: "Select a dentist." };
  }
  if (input.tier !== null && !isCommissionTier(input.tier)) {
    return { ok: false, message: "Tier must be 1, 2 or 3." };
  }

  await setDentistTier(input.dentistUserId, input.tier);
  revalidate();
  return { ok: true };
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
  const guard = await requireAdmin();
  if (!guard.ok) {
    return guard;
  }
  if (!input.procedureId) {
    return { ok: false, message: "Select a procedure." };
  }
  if (input.tiers.length === 0 || !input.tiers.every(isCommissionTier)) {
    return { ok: false, message: "Select at least one tier (1, 2 or 3)." };
  }
  if (
    !Number.isFinite(input.ratePercent) ||
    input.ratePercent < 0 ||
    input.ratePercent > 100
  ) {
    return { ok: false, message: "Rate must be between 0 and 100." };
  }
  const hmoPercent = input.hmoRatePercent;
  if (
    hmoPercent !== null &&
    (!Number.isFinite(hmoPercent) || hmoPercent < 0 || hmoPercent > 100)
  ) {
    return { ok: false, message: "HMO rate must be between 0 and 100." };
  }
  for (const peso of [input.pesoValue, input.hmoPesoValue]) {
    if (peso !== null && (!Number.isFinite(peso) || peso < 0)) {
      return { ok: false, message: "Peso values can't be negative." };
    }
  }

  for (const tier of new Set(input.tiers)) {
    await setTierRate(tier, input.procedureId, {
      ratePercent: input.ratePercent,
      hmoRatePercent: hmoPercent,
      pesoValue: input.pesoValue,
      hmoPesoValue: input.hmoPesoValue,
    });
  }
  revalidate();
  return { ok: true };
}

export async function deleteTierRateAction(id: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return guard;
  }

  await deleteTierRate(id);
  revalidate();
  return { ok: true };
}

/** Drops every individual rate of dentists that have a tier. */
export async function clearIndividualRatesAction(): Promise<
  { ok: true; removed: number } | { ok: false; message: string }
> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return guard;
  }

  const removed = await clearIndividualRatesForTieredDentists();
  revalidate();
  return { ok: true, removed };
}
