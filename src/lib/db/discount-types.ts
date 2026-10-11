import { asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { discountTypes, type DiscountTypeRow } from "@/lib/db/schema";

/** A discount as the transaction form needs it. */
export type DiscountTypeOption = {
  id: string;
  name: string;
  /** Fixed percentage (PWD / Senior 20); null = typed on the line. */
  defaultPercent: number | null;
  statutory: boolean;
  needsId: boolean;
};

function toOption(row: DiscountTypeRow): DiscountTypeOption {
  return {
    id: row.id,
    name: row.name,
    defaultPercent:
      row.defaultPercent === null ? null : Number(row.defaultPercent),
    statutory: row.statutory,
    needsId: row.needsId,
  };
}

/** All discount types (inactive too), for the server to look up by id or name. */
export async function listAllDiscountTypes(): Promise<DiscountTypeOption[]> {
  const rows = await db
    .select()
    .from(discountTypes)
    .orderBy(asc(discountTypes.sortOrder), asc(discountTypes.name));
  return rows.map(toOption);
}

/** The discounts staff can pick (active ones). */
export async function listActiveDiscountTypes(): Promise<DiscountTypeOption[]> {
  const rows = await db
    .select()
    .from(discountTypes)
    .orderBy(asc(discountTypes.sortOrder), asc(discountTypes.name));
  return rows.filter((row) => row.active).map(toOption);
}
