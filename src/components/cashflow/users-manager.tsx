"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  createUserAction,
  deleteUserAction,
  dismissResetRequestAction,
  resetUserPasswordAction,
} from "@/app/cashflow/users/actions";
import { FormField } from "@/components/auth/form-field";
import {
  PasswordDialog,
  type PasswordDialogState,
} from "@/components/cashflow/password-dialog";
import { Spinner } from "@/components/ui/spinner";
import { canManageUser, worksInEveryClinic } from "@/lib/auth/permissions";
import { canActOnRequestFor, canResetPassword } from "@/lib/auth/reset-rules";
import {
  USER_ROLE_LABELS,
  type AssignableRole,
  type UserRole,
} from "@/lib/cashflow/user-schema";
import type { Branch } from "@/lib/db/branches";

/** A user as the page hands it over (dates already text). */
export type ManagedUserView = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** The clinics ticked for the person; null = works in every clinic. */
  branchIds: string[] | null;
  /** True when their privileges differ from their role's defaults. */
  customized: boolean;
  createdAt: string;
  mustChangePassword: boolean;
  tempPasswordExpiresAt: string | null;
  /** Worked out on the server when the page was made. */
  tempPasswordExpired: boolean;
};

export type ResetRequestView = {
  id: string;
  createdAt: string;
  email: string;
  note: string;
  userId: string | null;
  userName: string | null;
  userRole: UserRole | null;
  branchId: string | null;
  ip: string;
  browser: string;
};

type FormState = {
  name: string;
  email: string;
  role: AssignableRole;
  branchIds: string[];
};

const INITIAL_STATE: FormState = {
  name: "",
  email: "",
  role: "staff",
  branchIds: [],
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const ROLE_BADGE: Record<UserRole, string> = {
  superuser: "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900",
  owner: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  admin: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  dentist: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  staff: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

const SELECT_CLASS =
  "select-chevron w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40";

export function UsersManager({
  users,
  currentUserId,
  currentUserRole,
  assignableRoles,
  branches,
  requests,
}: {
  users: ManagedUserView[];
  currentUserId: string;
  currentUserRole: UserRole;
  /** The roles this person may give (from `assignableRolesFor`). */
  assignableRoles: UserRole[];
  branches: Branch[];
  requests: ResetRequestView[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    ...INITIAL_STATE,
    role: (assignableRoles.includes("staff") ? "staff" : (assignableRoles[0] ?? "staff")) as AssignableRole,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<PasswordDialogState>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const branchName = (id: string | null) =>
    branches.find((branch) => branch.id === id)?.name ?? "No clinic";

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleClinic(id: string) {
    setForm((prev) => ({
      ...prev,
      branchIds: prev.branchIds.includes(id)
        ? prev.branchIds.filter((existing) => existing !== id)
        : [...prev.branchIds, id],
    }));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setErrors({});
    setStatus("submitting");

    const result = await createUserAction(form);

    if (!result.ok) {
      setStatus("idle");
      setFormError(result.message);
      if (result.fieldErrors) {
        setErrors(result.fieldErrors as FieldErrors);
      }
      return;
    }

    setStatus("idle");
    setForm((prev) => ({ ...INITIAL_STATE, role: prev.role }));
    setDialogError(null);
    setDialog({ kind: "issued", reason: "created", issued: result.data });
    router.refresh();
  }

  async function handleReset(userId: string) {
    setDialogBusy(true);
    setDialogError(null);
    try {
      const result = await resetUserPasswordAction(userId);
      if (!result.ok) {
        setDialogError(result.message);
        return;
      }
      setDialog({ kind: "issued", reason: "reset", issued: result.data });
      router.refresh();
    } finally {
      setDialogBusy(false);
    }
  }

  async function handleDismiss(requestId: string) {
    setRowBusyId(requestId);
    try {
      const result = await dismissResetRequestAction(requestId);
      if (!result.ok) {
        setFormError(result.message);
      }
      router.refresh();
    } finally {
      setRowBusyId(null);
    }
  }

  function askReset(userId: string, userName: string, email: string) {
    setDialogError(null);
    setDialog({ kind: "confirm-reset", userId, userName, email });
  }

  async function handleDelete(user: ManagedUserView) {
    if (
      !window.confirm(
        `Remove ${user.name} (${user.email})? They will no longer be able to sign in.`,
      )
    ) {
      return;
    }
    setRowBusyId(user.id);
    try {
      const result = await deleteUserAction(user.id);
      if (!result.ok) {
        setFormError(result.message);
      }
      router.refresh();
    } finally {
      setRowBusyId(null);
    }
  }

  const everyClinic = worksInEveryClinic(form.role);

  return (
    <div className="space-y-6">
      {requests.length > 0 && (
        <section
          aria-label="Password requests"
          className="rounded-xl border border-amber-200 bg-amber-50/60 p-6 dark:border-amber-900 dark:bg-amber-950/30"
        >
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Password requests ({requests.length})
          </h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            These people asked for a password reset. Check that it really is them
            (in person, or call back a number you already know) before you reset
            and hand over the temporary password.
          </p>
          <ul className="mt-4 divide-y divide-amber-100 dark:divide-amber-900/60">
            {requests.map((request) => {
              const canAct = canActOnRequestFor(currentUserRole, request.userRole);
              const busy = rowBusyId === request.id;
              return (
                <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">
                      {request.userName ?? "No matching account"}
                      <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
                        {request.email}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {dateTimeFormatter.format(new Date(request.createdAt))}
                      {request.userRole && ` · ${USER_ROLE_LABELS[request.userRole]}`}
                      {request.branchId && ` · ${branchName(request.branchId)}`}
                      {request.ip && ` · from ${request.ip}`}
                    </p>
                    {request.note && (
                      <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">
                        &ldquo;{request.note}&rdquo;
                      </p>
                    )}
                    {!request.userId && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                        No account has this e-mail. It is usually a typo; ask the person for the right address, or dismiss.
                      </p>
                    )}
                    {request.userId && !canAct && (
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Only someone above this account&apos;s level can reset its password.
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {request.userId && canAct && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => askReset(request.userId as string, request.userName ?? request.email, request.email)}
                        className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
                      >
                        Reset password
                      </button>
                    )}
                    {canAct && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDismiss(request.id)}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                      >
                        {busy ? "Working..." : "Dismiss"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}


      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Add a user
        </h3>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          The system makes a temporary password and shows it to you once. The
          person chooses their own the first time they sign in. You can fine-tune
          what they may do afterwards with <strong>Manage</strong>.
        </p>

        {formError && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {formError}
          </div>
        )}

        <form onSubmit={handleCreate} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              label="Full name"
              type="text"
              placeholder="Dr. Jamie Rivera"
              value={form.name}
              error={errors.name}
              onChange={(event) => updateField("name", event.target.value)}
            />
            <FormField
              label="Email"
              type="email"
              placeholder="jamie@practice.com"
              value={form.email}
              error={errors.email}
              onChange={(event) => updateField("email", event.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="new-user-role"
                className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Role
              </label>
              <select
                id="new-user-role"
                value={form.role}
                onChange={(event) =>
                  updateField("role", event.target.value as AssignableRole)
                }
                className={SELECT_CLASS}
              >
                {assignableRoles.map((role) => (
                  <option key={role} value={role}>
                    {USER_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {branches.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Authorized clinics
              </legend>
              {everyClinic ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Owners and admins work in every clinic.
                </p>
              ) : (
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {branches.map((branch) => (
                    <label
                      key={branch.id}
                      className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                    >
                      <input
                        type="checkbox"
                        checked={form.branchIds.includes(branch.id)}
                        onChange={() => toggleClinic(branch.id)}
                        className="h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                      />
                      {branch.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          )}

          <button
            type="submit"
            disabled={status === "submitting"}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {status === "submitting" && <Spinner />}
            {status === "submitting" ? "Adding..." : "Add user"}
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Clinics</th>
              <th className="px-4 py-3 font-medium">Added</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              const isBusy = rowBusyId === user.id;
              const me = { id: currentUserId, role: currentUserRole };
              const mayManage = canManageUser(me, { id: user.id, role: user.role }).ok;
              const mayReset = canResetPassword(me, { id: user.id, role: user.role }).ok;

              return (
                <tr key={user.id} className="text-zinc-700 dark:text-zinc-300">
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                    {user.name}
                    {isSelf && (
                      <span className="ml-2 text-xs font-normal text-zinc-400">
                        (you)
                      </span>
                    )}
                    {user.mustChangePassword && (
                      <p className="mt-0.5 text-xs font-normal text-amber-700 dark:text-amber-300">
                        Must choose a password
                        {user.tempPasswordExpiresAt &&
                          (user.tempPasswordExpired
                            ? " · temporary password expired"
                            : ` · temporary password valid until ${dateFormatter.format(new Date(user.tempPasswordExpiresAt))}`)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[user.role]}`}
                    >
                      {USER_ROLE_LABELS[user.role]}
                    </span>
                    {user.customized && (
                      <span
                        className="ml-2 text-xs text-zinc-500 dark:text-zinc-400"
                        title="Their privileges differ from the role's defaults"
                      >
                        customized
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {user.branchIds === null
                      ? "All clinics"
                      : user.branchIds.length === 0
                        ? <span className="text-amber-700 dark:text-amber-300">None yet</span>
                        : user.branchIds.map((id) => branchName(id)).join(", ")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {dateFormatter.format(new Date(user.createdAt))}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {mayManage && (
                      <Link
                        href={`/cashflow/users/${user.id}`}
                        className="mr-1 rounded-md px-2 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
                      >
                        Manage
                      </Link>
                    )}
                    {mayReset && (
                      <button
                        type="button"
                        onClick={() => askReset(user.id, user.name, user.email)}
                        disabled={isBusy}
                        className="mr-1 rounded-md px-2 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-40 dark:text-amber-300 dark:hover:bg-amber-950/40"
                      >
                        Reset password
                      </button>
                    )}
                    {mayManage && !isSelf && (
                      <button
                        type="button"
                        onClick={() => handleDelete(user)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      >
                        {isBusy && <Spinner className="h-3 w-3" />}
                        {isBusy ? "Working..." : "Remove"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dialog && (
        <PasswordDialog
          dialog={dialog}
          busy={dialogBusy}
          error={dialogError}
          onConfirmReset={() => dialog.kind === "confirm-reset" && handleReset(dialog.userId)}
          onClose={() => {
            setDialog(null);
            setDialogError(null);
          }}
        />
      )}
    </div>
  );
}
