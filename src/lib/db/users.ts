import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, type NewUserRow, type UserRow } from "@/lib/db/schema";
import type { UserRole } from "@/lib/cashflow/user-schema";

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branchId: string | null;
  createdAt: Date;
};

const PUBLIC_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  branchId: users.branchId,
  createdAt: users.createdAt,
} as const;

/** Includes the password hash — only for use inside auth.ts's authorize(). */
export async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return row;
}

export async function listUsers(): Promise<PublicUser[]> {
  return db.select(PUBLIC_COLUMNS).from(users).orderBy(users.createdAt);
}

export async function getUserById(id: string): Promise<PublicUser | undefined> {
  const [row] = await db.select(PUBLIC_COLUMNS).from(users).where(eq(users.id, id)).limit(1);
  return row;
}

export async function createUser(data: {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  branchId?: string | null;
}): Promise<PublicUser> {
  const [row] = await db
    .insert(users)
    .values({ ...data, email: data.email.trim().toLowerCase() } satisfies NewUserRow)
    .returning(PUBLIC_COLUMNS);
  return row;
}

export async function updateUserRole(id: string, role: UserRole): Promise<void> {
  await db.update(users).set({ role }).where(eq(users.id, id));
}

export async function updateUserBranch(id: string, branchId: string | null): Promise<void> {
  await db.update(users).set({ branchId }).where(eq(users.id, id));
}

export async function deleteUser(id: string): Promise<void> {
  await db.delete(users).where(eq(users.id, id));
}
