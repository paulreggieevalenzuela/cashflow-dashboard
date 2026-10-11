import { countArches, countTeeth } from "@/lib/cashflow/teeth";

/**
 * What a procedure's price is for. The price on the Procedures tab is always
 * the price of ONE of these; the quantity on a transaction line says how many.
 */
export const PRICE_BASES = ["flat", "tooth", "surface", "arch", "unit"] as const;
export type PriceBasis = (typeof PRICE_BASES)[number];

export const PRICE_BASIS_LABELS: Record<PriceBasis, string> = {
  flat: "Flat (one price)",
  tooth: "Per tooth",
  surface: "Per surface",
  arch: "Per arch",
  unit: "Per unit",
};

export function isPriceBasis(value: string | null | undefined): value is PriceBasis {
  return !!value && (PRICE_BASES as readonly string[]).includes(value);
}

export function normalizePriceBasis(value: string | null | undefined): PriceBasis {
  return isPriceBasis(value) ? value : "flat";
}

/**
 * The quantity to suggest from what is on the line, or null when the basis
 * gives no hint (flat, surface, unit — staff type those).
 *
 * - Per tooth: one for each tooth entered (at least 1).
 * - Per arch: one for each arch entered (at least 1).
 */
export function suggestQuantity(
  basis: PriceBasis,
  teeth: string | null | undefined,
): number | null {
  if (basis === "tooth") {
    return Math.max(1, countTeeth(teeth));
  }
  if (basis === "arch") {
    return Math.max(1, countArches(teeth));
  }
  return null;
}
