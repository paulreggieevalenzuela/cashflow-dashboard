import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/access";
import { can } from "@/lib/auth/guards";
import {
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  SENSITIVE_PERMISSIONS,
  canManageUser,
  managerRoleOf,
  roleDefaults,
  worksInEveryClinic,
  type Permission,
} from "@/lib/auth/permissions";
import { USER_ROLE_LABELS } from "@/lib/cashflow/user-schema";
import { lastAccessChanges } from "@/lib/db/audit";
import { listBranches } from "@/lib/db/branches";
import { listAllOverrides, listBranchIdsByUser } from "@/lib/db/user-access";
import { listUsers } from "@/lib/db/users";
import { PrintButton } from "@/app/cashflow/hmo/[id]/print/print-button";

export const metadata: Metadata = { title: "Access review" };

const stamp = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });

const LABELS = new Map<string, string>(
  PERMISSION_GROUPS.flatMap((group) =>
    group.permissions.map((permission) => [permission.key, permission.label] as const),
  ),
);
const SENSITIVE = new Set<string>(SENSITIVE_PERMISSIONS);

/**
 * "Who has extra privileges": everyone whose access differs from what their
 * role gives by default, for a periodic review (for example once a quarter).
 * Shows the privileges added on top of the role ("extra"), the ones taken away
 * ("removed"), the clinics, and when the access was last changed and by whom.
 */
export default async function AccessReviewPage() {
  const session = await auth();
  if (!session?.user || !can(session, "user.manage")) {
    redirect("/cashflow");
  }
  const viewerRole = managerRoleOf(session.user);
  if (!viewerRole) {
    redirect("/cashflow");
  }

  const [allUsers, overridesByUser, clinicsByUser, branches, changes] = await Promise.all([
    listUsers(),
    listAllOverrides(),
    listBranchIdsByUser(),
    listBranches(),
    lastAccessChanges().catch(() => new Map<string, { at: Date; by: string }>()),
  ]);
  const branchName = new Map(branches.map((branch) => [branch.id, branch.name]));

  // The superuser is never listed. Everyone else is listed only if this
  // person may manage them (so an admin does not see owners' or admins' access).
  const people = allUsers
    .filter((user) => user.role !== "superuser")
    .filter((user) => user.id === session.user.id || canManageUser({ id: session.user.id, role: viewerRole }, user).ok);

  const rows = people
    .map((user) => {
      const defaults = new Set<string>(roleDefaults(user.role));
      const overrides = overridesByUser.get(user.id) ?? [];
      const known = overrides.filter((override) => (ALL_PERMISSIONS as readonly string[]).includes(override.permission));
      // Only real differences count (an override equal to the default is no change).
      const extra = known
        .filter((override) => override.granted && !defaults.has(override.permission))
        .map((override) => override.permission as Permission);
      const removed = known
        .filter((override) => !override.granted && defaults.has(override.permission))
        .map((override) => override.permission as Permission);
      const clinics = worksInEveryClinic(user.role)
        ? null
        : (clinicsByUser.get(user.id) ?? (user.branchId ? [user.branchId] : []));
      const sensitiveExtra = extra.filter((permission) => SENSITIVE.has(permission));
      return {
        user,
        extra,
        removed,
        clinics,
        sensitiveExtra,
        changed: changes.get(user.id) ?? null,
        manageable:
          user.id !== session.user.id &&
          canManageUser({ id: session.user.id, role: viewerRole }, user).ok,
      };
    })
    .sort(
      (a, b) =>
        b.sensitiveExtra.length - a.sensitiveExtra.length ||
        b.extra.length + b.removed.length - (a.extra.length + a.removed.length) ||
        a.user.name.localeCompare(b.user.name),
    );

  const customized = rows.filter((row) => row.extra.length > 0 || row.removed.length > 0);
  const withExtra = rows.filter((row) => row.extra.length > 0);
  const withSensitive = rows.filter((row) => row.sensitiveExtra.length > 0);
  const labelFor = (key: string) => LABELS.get(key) ?? key;

  const tile = (value: number, label: string, tone = "text-zinc-900 dark:text-zinc-50") => (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <Link href="/cashflow/users" className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400">
            ← Users
          </Link>
          <h2 className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Access review: who has extra privileges
          </h2>
        </div>
        <PrintButton />
      </div>
      <h2 className="hidden text-lg font-semibold print:block">
        ADT Dental Clinic: access review ({stamp.format(new Date())})
      </h2>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        <p>
          Every role starts with a set of privileges (for example, owners and
          admins can delete visits; staff cannot). An{" "}
          <strong>extra privilege</strong> is one a person has{" "}
          <em>on top of</em> their role, ticked for them one by one in{" "}
          <strong>Manage</strong>; a <strong>removed privilege</strong> is one
          their role would give but was taken away. Together these are the
          person&apos;s exceptions. Exceptions are fine, but they are easy to
          forget: a temporary favour can become permanent. Review this page
          regularly (for example every quarter) and use <strong>Manage</strong>{" "}
          → <em>Reset to role defaults</em> for anything that is no longer
          needed. Privileges marked <span className="font-semibold text-red-700 dark:text-red-400">sensitive</span>{" "}
          (deleting, voiding, importing, revealing IDs, managing users, and
          similar) deserve the closest look.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tile(rows.length, "People reviewed")}
        {tile(customized.length, "With exceptions")}
        {tile(withExtra.length, "With extra privileges")}
        {tile(withSensitive.length, "With extra sensitive privileges", withSensitive.length > 0 ? "text-red-600 dark:text-red-400" : undefined)}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Person</th>
              <th className="px-4 py-3 font-medium">Clinics</th>
              <th className="px-4 py-3 font-medium">Extra privileges</th>
              <th className="px-4 py-3 font-medium">Removed privileges</th>
              <th className="px-4 py-3 font-medium">Last changed</th>
              <th className="px-4 py-3 print:hidden" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">
                  No users to review.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.user.id} className="align-top text-zinc-700 dark:text-zinc-300">
                <td className="px-4 py-3">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">{row.user.name}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {USER_ROLE_LABELS[row.user.role]} · {row.user.email}
                  </p>
                </td>
                <td className="px-4 py-3 text-xs">
                  {row.clinics === null
                    ? "All clinics"
                    : row.clinics.length === 0
                      ? "None assigned"
                      : row.clinics.map((id) => branchName.get(id) ?? "Unknown").join(", ")}
                </td>
                <td className="px-4 py-3">
                  {row.extra.length === 0 ? (
                    <span className="text-xs text-zinc-400">None</span>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {row.extra.map((permission) => (
                        <li
                          key={permission}
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            SENSITIVE.has(permission)
                              ? "bg-red-50 font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
                              : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          }`}
                        >
                          {labelFor(permission)}
                          {SENSITIVE.has(permission) && <span className="sr-only"> (sensitive)</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.removed.length === 0 ? (
                    <span className="text-xs text-zinc-400">None</span>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {row.removed.map((permission) => (
                        <li
                          key={permission}
                          className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 line-through dark:bg-zinc-800 dark:text-zinc-400"
                        >
                          {labelFor(permission)}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {row.changed ? (
                    <>
                      {stamp.format(row.changed.at)}
                      <br />
                      <span className="text-zinc-500 dark:text-zinc-400">by {row.changed.by}</span>
                    </>
                  ) : (
                    <span className="text-zinc-400">No change recorded</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right print:hidden">
                  {row.manageable && (
                    <Link
                      href={`/cashflow/users/${row.user.id}`}
                      className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Manage
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {viewerRole === "superuser"
          ? "You see everyone except the superuser account."
          : viewerRole === "owner"
            ? "You see admins, dentists and staff, and yourself."
            : "You see dentists and staff, and yourself."}{" "}
        Red marks a sensitive privilege given as an extra.
      </p>
    </div>
  );
}
