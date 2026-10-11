import { and, eq, ilike, isNull } from "drizzle-orm";
import { normalizePriceBasis, type PriceBasis } from "@/lib/cashflow/price-basis";
import { normalizeVatType, type VatType } from "@/lib/cashflow/pricing";
import { db } from "@/lib/db/client";
import {
  procedurePrices,
  procedures,
  type ProcedureRow,
} from "@/lib/db/schema";

export async function listProcedures(): Promise<ProcedureRow[]> {
  return db.select().from(procedures).orderBy(procedures.name);
}

/** A procedure as the transaction form needs it: name, the list price and
 * VAT setting used to pre-fill a new line, and what the price counts. */
export type ProcedureOption = {
  name: string;
  defaultPrice: number | null;
  defaultVatType: VatType;
  priceBasis: PriceBasis;
  /** Price for each HMO that has one, keyed by the payment type name
   * (e.g. { Maxicare: 250 }). Cash and the other payment methods use
   * `defaultPrice`. */
  payerPrices: Record<string, number>;
};

/** Every HMO price, grouped by procedure id. */
export async function loadPayerPrices(): Promise<
  Map<string, Record<string, number>>
> {
  const rows = await db.select().from(procedurePrices);
  const byProcedure = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const prices = byProcedure.get(row.procedureId) ?? {};
    prices[row.payer] = Number(row.price);
    byProcedure.set(row.procedureId, prices);
  }
  return byProcedure;
}

/** Procedures staff can pick on a transaction (hidden ones are left out). */
export async function listProcedureOptions(): Promise<ProcedureOption[]> {
  const [rows, payerPrices] = await Promise.all([
    listProcedures(),
    loadPayerPrices(),
  ]);
  return rows
    .filter((row) => row.active)
    .map((row) => ({
      payerPrices: payerPrices.get(row.id) ?? {},
      name: row.name,
      defaultPrice: row.defaultPrice === null ? null : Number(row.defaultPrice),
      defaultVatType: normalizeVatType(row.defaultVatType),
      priceBasis: normalizePriceBasis(row.priceBasis),
    }));
}

/** What the server needs to know about a procedure when it saves a line. */
export type ProcedureInfo = {
  id: string;
  vatType: VatType;
  priceBasis: PriceBasis;
  active: boolean;
};

/** Every procedure (hidden ones too), keyed by lower-cased name. */
export async function loadProcedureInfoMap(): Promise<Map<string, ProcedureInfo>> {
  const rows = await listProcedures();
  return new Map(
    rows.map((row) => [
      row.name.trim().toLowerCase(),
      {
        id: row.id,
        vatType: normalizeVatType(row.defaultVatType),
        priceBasis: normalizePriceBasis(row.priceBasis),
        active: row.active,
      },
    ]),
  );
}

/**
 * Gives a procedure its first list price. The price list is maintained from
 * the clinic's sheet, so a price typed on a transaction (a one-off, a
 * negotiated amount) never overwrites it — this only fills a procedure that
 * has no price at all yet, such as one added on the fly from the form.
 */
export async function rememberProcedureDefaults(
  procedureId: string,
  defaults: { price: number },
): Promise<void> {
  if (!(defaults.price > 0)) {
    return;
  }
  await db
    .update(procedures)
    .set({ defaultPrice: defaults.price.toString() })
    .where(
      and(eq(procedures.id, procedureId), isNull(procedures.defaultPrice)),
    );
}

/**
 * Looks up a procedure on the price list by name (case-insensitive,
 * trimmed). The list is maintained from the clinic's price list, so a name
 * that isn't on it is NOT added — not from the transaction form, not from a
 * CSV import, not from the commission backfill: that transaction simply has
 * no procedure link (and so no commission rate).
 *
 * Returns `undefined` for a blank or unknown name.
 */
export async function findProcedureByName(
  rawName: string,
): Promise<ProcedureRow | undefined> {
  const name = rawName.trim();
  if (!name) {
    return undefined;
  }
  const [existing] = await db
    .select()
    .from(procedures)
    .where(ilike(procedures.name, name))
    .limit(1);
  return existing;
}
