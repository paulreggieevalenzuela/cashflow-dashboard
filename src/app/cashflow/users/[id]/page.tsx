import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/access";
import { can } from "@/lib/auth/guards";
import {
  ALL_PERMISSIONS,
  assignableRolesFor,
  canManageUser,
  effectivePermissions,
  worksInEveryClinic,
} from "@/lib/auth/permissions";
import { canResetPassword } from "@/lib/auth/reset-rules";
import type { UserRole } from "@/lib/cashflow/user-schema";
import { listBranches } from "@/lib/db/branches";
import { getOverrides, getUserBranchIds } from "@/lib/db/user-access";
import { listUsers } from "@/lib/db/users";
import { UserAccessEditor } from "@/components/cashflow/user-access-editor";

export const metadata: Metadata = {
  title: "Manage user",
};

export default async function ManageUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || !can(session, "user.manage")) {
    redirect("/cashflow");
  }
  const { id } = await params;

  const [users, branches] = await Promise.all([listUsers(), listBranches()]);
  const user = users.find((candidate) => candidate.id === id);
  // The superuser is never shown, and nobody opens their own access screen.
  if (!user || user.role === "superuser") {
    notFound();
  }

  const myRole: UserRole = session.user.isSuperuser
    ? "superuser"
    : session.user.isOwner
      ? "owner"
      : "admin";
  const me = { id: session.user.id, role: myRole };
  const decision = canManageUser(me, { id: user.id, role: user.role });
  if (!decision.ok) {
    redirect("/cashflow/users");
  }

  const overrides = await getOverrides(user.id);
  const branchIds = worksInEveryClinic(user.role)
    ? []
    : await getUserBranchIds(user.id, user.branchId);

  const roleChoices = [...new Set<UserRole>([user.role, ...assignableRolesFor(myRole)])];
  const mine = new Set<string>(session.user.permissions ?? []);
  const grantable =
    myRole === "superuser" ? null : ALL_PERMISSIONS.filter((key) => mine.has(key));

  return (
    <UserAccessEditor
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
        mustChangePassword: user.mustChangePassword,
        tempPasswordExpiresAt: user.tempPasswordExpiresAt?.toISOString() ?? null,
        tempPasswordExpired: user.tempPasswordExpiresAt
          ? user.tempPasswordExpiresAt.getTime() < new Date().getTime()
          : false,
      }}
      branches={branches}
      initialRole={user.role}
      initialBranchIds={branchIds}
      initialPermissions={effectivePermissions(user.role, overrides)}
      roleChoices={roleChoices}
      grantable={grantable}
      canReset={canResetPassword(me, { id: user.id, role: user.role }).ok}
      canRemove={user.id !== session.user.id}
    />
  );
}
