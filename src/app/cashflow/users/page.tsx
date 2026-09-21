import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listBranches } from "@/lib/db/branches";
import { listUsers } from "@/lib/db/users";
import { UsersManager } from "@/components/cashflow/users-manager";

export const metadata: Metadata = {
  title: "Users",
};

export default async function UsersPage() {
  const session = await auth();

  if (session?.user.role !== "admin") {
    redirect("/cashflow");
  }

  const [users, branches] = await Promise.all([listUsers(), listBranches()]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Users</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage who can sign in and what they can do. Admins have full access;
          dentists and staff can add and view transactions but can&apos;t
          delete records or manage users.
        </p>
      </div>
      <UsersManager users={users} currentUserId={session.user.id} branches={branches} />
    </div>
  );
}
