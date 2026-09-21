import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { branches, type BranchRow } from "@/lib/db/schema";

export type Branch = BranchRow;

export async function listBranches(): Promise<Branch[]> {
  return db.select().from(branches).orderBy(branches.name);
}

export async function getBranchById(id: string): Promise<Branch | undefined> {
  const [row] = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  return row;
}

export async function createBranch(name: string): Promise<Branch> {
  const [row] = await db.insert(branches).values({ name: name.trim() }).returning();
  return row;
}

export async function renameBranch(id: string, name: string): Promise<void> {
  await db.update(branches).set({ name: name.trim() }).where(eq(branches.id, id));
}

/**
 * Branches aren't cascade-protected at the DB level on purpose — deleting
 * one just sets `branchId` to null on every user/transaction that
 * referenced it (see the `onDelete: "set null"` on both FKs in schema.ts),
 * rather than blocking the delete or silently deleting real transaction
 * history because an admin renamed/removed a location.
 */
export async function deleteBranch(id: string): Promise<void> {
  await db.delete(branches).where(eq(branches.id, id));
}
