"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { isPriceBasis } from "@/lib/cashflow/price-basis";
import {
  createProcedure,
  deleteUnusedProcedure,
  listPriceHistory,
  updateProcedure,
  type PriceHistoryEntry,
  type ProcedureInput,
} from "@/lib/db/procedure-admin";

type Result =
  | { ok: true }
  | { ok: false; message: string; needsConfirm?: boolean };

const InputSchema = z.object({
  name: z.string().trim().min(1, "Enter the procedure name.").max(200),
  vatType: z.enum(["vat", "non_vat"]),
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
  const session = await auth();
  if (!session?.user) {
    return { ok: false as const, message: "You must be signed in." };
  }
  if (session.user.role !== "admin") {
    return {
      ok: false as const,
      message: "Only admins can change the procedure list.",
    };
  }
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
  refresh();
  return { ok: true };
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
