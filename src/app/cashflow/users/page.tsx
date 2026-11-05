import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/access";
import { listBranches } from "@/lib/db/branches";
import { listOpenResetRequests } from "@/lib/db/password-requests";
import { listUsers } from "@/lib/db/users";
import { UsersManager, type ResetRequestView } from "@/components/cashflow/users-manager";

export const metadata: Metadata = {
  title: "Users",
};

export default async function UsersPage() {
  const session = await auth();

  if (session?.user.role !== "admin") {
    redirect("/cashflow");
  }

  const [users, branches, openRequests] = await Promise.all([
    listUsers(),
    listBranches(),
    listOpenResetRequests(),
  ]);

  // A request for the superuser's e-mail is never shown to anyone (nobody can
  // reset the superuser from here). Everything else is listed; the screen
  // decides which ones this person can act on.
  const requests: ResetRequestView[] = openRequests
    .filter((request) => request.userRole !== "superuser")
    .map((request) => ({
      id: request.id,
      createdAt: request.createdAt.toISOString(),
      email: request.email,
      note: request.note,
      userId: request.userId,
      userName: request.userName,
      userRole: request.userRole,
      branchId: request.branchId,
      ip: request.ip,
      browser: request.userAgent.slice(0, 80),
    }));

  const isSuperuser = session.user.isSuperuser;
  const renderedAt = new Date().getTime();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Users</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage who can sign in and what they can do. Admins have full access;
          dentists and staff can add and view transactions but can&apos;t
          delete records or manage users. New accounts and password resets get a
          temporary password that the person must replace when they first sign
          in.{" "}
          {isSuperuser
            ? "As the superuser you can reset anyone's password, including admins'."
            : "Only the superuser can reset an admin's password."}
        </p>
      </div>
      <UsersManager
        users={users.map((user) => ({
          ...user,
          createdAt: user.createdAt.toISOString(),
          tempPasswordExpiresAt: user.tempPasswordExpiresAt?.toISOString() ?? null,
          tempPasswordExpired: user.tempPasswordExpiresAt
            ? user.tempPasswordExpiresAt.getTime() < renderedAt
            : false,
        }))}
        currentUserId={session.user.id}
        currentUserRole={isSuperuser ? "superuser" : "admin"}
        branches={branches}
        requests={requests}
      />
    </div>
  );
}
