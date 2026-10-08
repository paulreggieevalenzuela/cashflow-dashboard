"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  deleteCommissionRate,
  setCommissionRate,
} from "@/lib/db/commission-rates";

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
