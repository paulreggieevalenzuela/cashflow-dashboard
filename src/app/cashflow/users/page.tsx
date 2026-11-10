import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/access";
import { can } from "@/lib/auth/guards";
import { assignableRolesFor, worksInEveryClinic } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/cashflow/user-schema";
import { listBranches } from "@/lib/db/branches";
import { listOpenResetRequests } from "@/lib/db/password-requests";
import { listBranchIdsByUser, listCustomizedUserIds } from "@/lib/db/user-access";
import { listUsers } from "@/lib/db/users";
import { UsersManager, type ResetRequestView } from "@/components/cashflow/users-manager";

export const metadata: Metadata = {
  title: "Users",
};

export default async function UsersPage() {
  const session = await auth();

  if (!session?.user || !can(session, "user.manage")) {
    redirect("/cashflow");
  }

  const [allUsers, branches, openRequests, clinicsByUser] = await Promise.all([
    listUsers(),
    listBranches(),
    listOpenResetRequests(),
    listBranchIdsByUser(),
  ]);

  // The superuser is never listed: not even to themselves. Nobody can change
  // or remove that account from the app.
  const users = allUsers.filter((user) => user.role !== "superuser");
  const customized = await listCustomizedUserIds(users.map((user) => user.id));

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

  const myRole: UserRole = session.user.isSuperuser
    ? "superuser"
    : session.user.isOwner
      ? "owner"
      : "admin";
  const renderedAt = new Date().getTime();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Users</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage who can sign in and what they can do. Owners and admins work in
          every clinic and have the same controls; dentists and staff work in the
          clinics ticked for them. Use <strong>Manage</strong> to change a
          person&apos;s role, clinics and privileges one by one. New accounts and
          password resets get a temporary password that the person must replace
          when they first sign in.{" "}
          {myRole === "superuser"
            ? "As the superuser you manage everyone, including owners."
            : myRole === "owner"
              ? "As an owner you can manage admins, dentists and staff."
              : "You can manage dentists and staff; an owner manages admins."}
        </p>
      </div>
      <UsersManager
        users={users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          branchIds: worksInEveryClinic(user.role)
            ? null
            : (clinicsByUser.get(user.id) ?? (user.branchId ? [user.branchId] : [])),
          customized: customized.has(user.id),
          createdAt: user.createdAt.toISOString(),
          mustChangePassword: user.mustChangePassword,
          tempPasswordExpiresAt: user.tempPasswordExpiresAt?.toISOString() ?? null,
          tempPasswordExpired: user.tempPasswordExpiresAt
            ? user.tempPasswordExpiresAt.getTime() < renderedAt
            : false,
        }))}
        currentUserId={session.user.id}
        currentUserRole={myRole}
        assignableRoles={assignableRolesFor(myRole)}
        branches={branches}
        requests={requests}
      />
    </div>
  );
}
