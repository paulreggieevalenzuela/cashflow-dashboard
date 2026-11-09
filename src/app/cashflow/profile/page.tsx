import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/access";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { BranchSelect } from "@/components/cashflow/branch-select";
import { ThemeToggle } from "@/components/cashflow/theme-toggle";
import { listBranches } from "@/lib/db/branches";
import { USER_ROLE_LABELS } from "@/lib/cashflow/user-schema";
import { getUserById } from "@/lib/db/users";
import { getUserTheme } from "@/lib/db/user-preferences";

export const metadata: Metadata = {
  title: "My Profile",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [user, theme, branches] = await Promise.all([
    getUserById(session.user.id),
    getUserTheme(session.user.id),
    listBranches(),
  ]);

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          My profile
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Your account details and display preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-2">
        <Field label="Name" value={user.name} />
        <Field label="Email" value={user.email} />
        <Field label="Role" value={USER_ROLE_LABELS[user.role]} />
        <Field label="Member since" value={dateFormatter.format(new Date(user.createdAt))} />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Branch</h3>
        <div className="mt-4">
          {session.user.role === "admin" ? (
            <BranchSelect branches={branches} initialBranchId={user.branchId ?? ""} />
          ) : (
            <div className="space-y-1">
              <Field
                label="My branch"
                value={
                  branches.find((branch) => branch.id === user.branchId)?.name ??
                  "No branch assigned yet"
                }
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Your branch is set by an admin. Visits you add are saved under
                it and the Queue shows it.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Password</h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Changing your password signs you out of your other devices.
        </p>
        <div className="mt-4 max-w-sm">
          <ChangePasswordForm forced={false} compact />
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Appearance</h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Choose how Cashflow looks for you. This is saved to your account, so it
          follows you to any device you sign in from.
        </p>
        <div className="mt-4">
          <ThemeToggle initialTheme={theme} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}
