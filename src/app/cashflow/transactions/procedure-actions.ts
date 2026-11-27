"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { isPriceBasis } from "@/lib/cashflow/price-basis";
import { logAudit } from "@/lib/db/audit";
import { recalculateCommissions, type RecalcResult } from "@/lib/db/commission-recalc";
import {
  createProcedure,
  deleteUnusedProcedure,
  listPriceHistory,
  updateProcedure,
  type PriceHistoryEntry,
  type ProcedureInput,
} from "@/lib/db/procedure-admin";

type Result =
  | { ok: true; notice?: string }
  | { ok: false; message: string; needsConfirm?: boolean };

const InputSchema = z.object({
  name: z.string().trim().min(1, "Enter the procedure name.").max(200),
  // VAT 12% or Non-VAT, as picked on the price list.
  vatType: z.enum(["vat", "non_vat"]).optional(),
  price: z
    .number()
    .nonnegative("Price can't be negative.")
    .max(10_000_000, "Price looks too high.")
    .nullable(),
  priceBasis: z.string().refine(isPriceBasis, "Choose what the price is for."),
  active: z.boolean(),
  note: z.string().trim().max(300).default(""),
  // Price per accepted HMO; null / missing = no price for that HMO.
  payerPrices: z
    .record(
      z.string(),
      z
        .number()
        .nonnegative("Price can't be negative.")
        .max(10_000_000, "Price looks too high.")
        .nullable(),
    ),
});

async function requireAdmin() {
  const guard = await requirePermission(
    "procedure.manage",
    "You don't have permission to change the procedure list.",
  );
  if (!guard.ok) {
    return { ok: false as const, message: guard.message };
  }
  const session = guard.session;
  return {
    ok: true as const,
    actor: {
      userId: session.user.id ?? null,
      name: session.user.name ?? session.user.email ?? "Admin",
    },
  };
}

function refresh() {
  revalidatePath("/cashflow/transactions");
  revalidatePath("/cashflow/commissions");
}

function parse(raw: unknown):
  | { ok: true; value: ProcedureInput }
  | { ok: false; message: string } {
  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the fields.",
    };
  }
  return {
    ok: true,
    value: {
      ...parsed.data,
      priceBasis: parsed.data.priceBasis as ProcedureInput["priceBasis"],
    },
  };
}

export async function addProcedureAction(raw: unknown): Promise<Result> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return guard;
  }
  const input = parse(raw);
  if (!input.ok) {
    return input;
  }
  const result = await createProcedure(input.value, guard.actor);
  if (!result.ok) {
    return result;
  }
  refresh();
  return { ok: true };
}

export async function updateProcedureAction(
  id: string,
  raw: unknown,
  confirmLargeChange: boolean,
): Promise<Result> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return guard;
  }
  const input = parse(raw);
  if (!input.ok) {
    return input;
  }
  const result = await updateProcedure(
    id,
    input.value,
    guard.actor,
    confirmLargeChange,
  );
  if (!result.ok) {
    return result;
  }
  let notice: string | undefined;
  if (result.vatChange) {
    // Commission follows the price list's VAT type: the procedure's saved
    // lines are worked out again, checked visits included (November 2026).
    // Receipts keep the VAT they were issued with.
    let recalc: RecalcResult | null = null;
    try {
      recalc = await recalculateCommissions({ procedureIds: [id] });
    } catch (error) {
      console.error("Couldn't recalculate commissions", error);
    }
    const from = VAT_LABELS[result.vatChange.from];
    const to = VAT_LABELS[result.vatChange.to];
    await logAudit({
      action: "commission.procedure_vat_changed",
      entityType: "commission",
      entityId: id,
      summary: `${guard.actor.name} changed ${result.vatChange.name} from ${from} to ${to}${
        recalc ? ` · ${recalcSummary(recalc)}` : ""
      }`,
      changes: [{ field: `${result.vatChange.name} · VAT`, from, to }],
      actor: guard.actor,
    });
    notice = recalc
      ? recalc.changed === 0
        ? `Saved. ${result.vatChange.name} is now ${to}. No saved commission changed.`
        : `Saved. ${result.vatChange.name} is now ${to}. ${recalcSummary(recalc)}.`
      : "Saved, but saved commissions could not be updated. Press Recalculate all commissions on the Commissions page.";
  }
  refresh();
  return { ok: true, notice };
}

const VAT_LABELS = { vat: "VAT 12%", non_vat: "Non-VAT" } as const;

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

function recalcSummary(result: RecalcResult): string {
  if (result.changed === 0) return "no saved commission changed";
  const sign = result.difference > 0 ? "+" : result.difference < 0 ? "−" : "";
  return `Commission updated on ${result.changed} saved line${
    result.changed === 1 ? "" : "s"
  } (${sign}${peso.format(Math.abs(result.difference))} in total)`;
}

export async function deleteProcedureAction(id: string): Promise<Result> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return guard;
  }
  const result = await deleteUnusedProcedure(id);
  if (!result.ok) {
    return result;
  }
  refresh();
  return { ok: true };
}

export async function loadPriceHistoryAction(
  id: string,
): Promise<
  { ok: true; entries: PriceHistoryEntry[] } | { ok: false; message: string }
> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "You must be signed in." };
  }
  return { ok: true, entries: await listPriceHistory(id) };
}
