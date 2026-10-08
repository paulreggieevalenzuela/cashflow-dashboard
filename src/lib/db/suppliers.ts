import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { suppliers } from "@/lib/db/schema";

export type Supplier = {
  id: string;
  name: string;
  address: string;
  tin: string;
};

function supplierKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Every supplier, A to Z. The list stays small (a clinic has a few dozen
 * regular suppliers), so the expense form gets it whole and filters it in
 * the browser. */
export async function listSuppliers(): Promise<Supplier[]> {
  const rows = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      address: suppliers.address,
      tin: suppliers.tin,
    })
    .from(suppliers)
    .orderBy(asc(suppliers.nameKey));
  return rows;
}

/**
 * Finds the supplier with this name or creates it. An existing supplier is
 * never overwritten by what was typed this time — but blank address/TIN on
 * file are filled in from it, so details entered once on a later expense
 * stick. Returns `undefined` for a blank name (a cash purchase with no
 * supplier).
 */
export async function getOrCreateSupplier(input: {
  name: string;
  address?: string;
  tin?: string;
}): Promise<Supplier | undefined> {
  const name = input.name.trim().replace(/\s+/g, " ");
  const key = supplierKey(input.name);
  if (!key) {
    return undefined;
  }
  const address = (input.address ?? "").trim();
  const tin = (input.tin ?? "").trim();

  let [existing] = await db.select().from(suppliers).where(eq(suppliers.nameKey, key)).limit(1);

  if (!existing) {
    const [inserted] = await db
      .insert(suppliers)
      .values({ name, nameKey: key, address, tin })
      .onConflictDoNothing({ target: suppliers.nameKey })
      .returning();
    if (inserted) {
      return { id: inserted.id, name: inserted.name, address: inserted.address, tin: inserted.tin };
    }
    [existing] = await db.select().from(suppliers).where(eq(suppliers.nameKey, key)).limit(1);
    if (!existing) {
      return undefined;
    }
  }

  const fill: { address?: string; tin?: string } = {};
  if (!existing.address && address) fill.address = address;
  if (!existing.tin && tin) fill.tin = tin;
  if (Object.keys(fill).length > 0) {
    await db.update(suppliers).set(fill).where(eq(suppliers.id, existing.id));
  }

  return {
    id: existing.id,
    name: existing.name,
    address: fill.address ?? existing.address,
    tin: fill.tin ?? existing.tin,
  };
}
