"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  createUserAction,
  deleteUserAction,
  dismissResetRequestAction,
  resetUserPasswordAction,
  updateUserBranchAction,
  updateUserRoleAction,
  type TempPasswordIssued,
} from "@/app/cashflow/users/actions";
import { FormField } from "@/components/auth/form-field";
import { canActOnRequestFor, canResetPassword } from "@/lib/auth/reset-rules";
import {
  USER_ROLES,
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
  branchId: string | null;
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
  branchId: string;
};

const INITIAL_STATE: FormState = {
  name: "",
  email: "",
  role: "staff",
  branchId: "",
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

type Dialog =
  | { kind: "confirm-reset"; userId: string; userName: string; email: string }
  | { kind: "issued"; reason: "created" | "reset"; issued: TempPasswordIssued }
  | null;

export function UsersManager({
  users,
  currentUserId,
  currentUserRole,
  branches,
  requests,
}: {
  users: ManagedUserView[];
  currentUserId: string;
  currentUserRole: UserRole;
  branches: Branch[];
  requests: ResetRequestView[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const branchName = (id: string | null) =>
    branches.find((branch) => branch.id === id)?.name ?? "No branch";

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
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
    setForm(INITIAL_STATE);
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

  async function handleRoleChange(userId: string, role: AssignableRole) {
    setRowBusyId(userId);
    try {
      const result = await updateUserRoleAction(userId, role);
      if (!result.ok) {
        window.alert(result.message);
      }
      router.refresh();
    } finally {
      setRowBusyId(null);
    }
  }

  async function handleBranchChange(userId: string, branchId: string) {
    setRowBusyId(userId);
    try {
      const result = await updateUserBranchAction(userId, branchId);
      if (!result.ok) {
        window.alert(result.message);
      }
      router.refresh();
    } finally {
      setRowBusyId(null);
    }
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
        window.alert(result.message);
      }
      router.refresh();
    } finally {
      setRowBusyId(null);
    }
  }

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
                        Only the superuser can reset an admin&apos;s password.
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
          person chooses their own the first time they sign in.
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
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Role
              </label>
              <select
                value={form.role}
                onChange={(event) =>
                  updateField("role", event.target.value as AssignableRole)
                }
                className="select-chevron w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
              >
                {USER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {USER_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {branches.length > 0 && (
            <div className="flex flex-col gap-1.5 sm:w-1/2 sm:pr-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Branch
              </label>
              <select
                value={form.branchId}
                onChange={(event) =>
                  updateField("branchId", event.target.value)
                }
                className="select-chevron w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
              >
                <option value="">No branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={status === "submitting"}
            className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {status === "submitting" ? "Adding..." : "Add user"}
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              {branches.length > 0 && (
                <th className="px-4 py-3 font-medium">Branch</th>
              )}
              <th className="px-4 py-3 font-medium">Added</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              const isBusy = rowBusyId === user.id;

              return (
                <tr key={user.id} className="text-zinc-700 dark:text-zinc-300">
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                    {user.name}
                    {isSelf && (
                      <span className="ml-2 text-xs font-normal text-zinc-400">
                        (you)
                      </span>
                    )}
                    {user.role === "superuser" && (
                      <span className="ml-2 rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-zinc-100 dark:text-zinc-900">
                        Superuser
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
                    {user.role === "superuser" ? (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {USER_ROLE_LABELS.superuser}
                      </span>
                    ) : (
                    <select
                      value={user.role}
                      disabled={isBusy || isSelf}
                      onChange={(event) =>
                        handleRoleChange(
                          user.id,
                          event.target.value as AssignableRole,
                        )
                      }
                      className="select-chevron-sm rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 outline-none disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    >
                      {USER_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {USER_ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                    )}
                  </td>
                  {branches.length > 0 && (
                    <td className="px-4 py-3">
                      <select
                        value={user.branchId ?? ""}
                        disabled={isBusy}
                        onChange={(event) =>
                          handleBranchChange(user.id, event.target.value)
                        }
                        className="select-chevron-sm rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 outline-none disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                      >
                        <option value="">No branch</option>
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td className="whitespace-nowrap px-4 py-3">
                    {dateFormatter.format(new Date(user.createdAt))}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {canResetPassword(
                      { id: currentUserId, role: currentUserRole },
                      { id: user.id, role: user.role },
                    ).ok && (
                      <button
                        type="button"
                        onClick={() => askReset(user.id, user.name, user.email)}
                        disabled={isBusy}
                        className="mr-1 rounded-md px-2 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-40 dark:text-amber-300 dark:hover:bg-amber-950/40"
                      >
                        Reset password
                      </button>
                    )}
                    {user.role !== "superuser" && (
                    <button
                      type="button"
                      onClick={() => handleDelete(user)}
                      disabled={isBusy || isSelf}
                      className="rounded-md px-2 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    >
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

/**
 * One window for both steps: confirm a reset, then show the temporary
 * password. The password exists only in this window's memory; closing it
 * loses it (reset again to get a new one).
 */
function PasswordDialog({
  dialog,
  busy,
  error,
  onConfirmReset,
  onClose,
}: {
  dialog: NonNullable<Dialog>;
  busy: boolean;
  error: string | null;
  onConfirmReset: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"password" | "message" | null>(null);

  async function copy(kind: "password" | "message", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard blocked: the text is on screen to copy by hand.
    }
  }

  const shell = (children: ReactNode, title: string) => (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        {children}
      </div>
    </div>
  );

  if (dialog.kind === "confirm-reset") {
    return shell(
      <>
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Reset password for {dialog.userName}?
        </h3>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {dialog.email} gets a new temporary password and must choose their own
          the next time they sign in. They are signed out of every device now.
          Only continue if you are sure it is really them asking.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirmReset}
            disabled={busy}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {busy ? "Resetting..." : "Reset password"}
          </button>
        </div>
      </>,
      "Confirm password reset",
    );
  }

  const { issued, reason } = dialog;
  const firstName = issued.userName.split(" ")[0] ?? issued.userName;
  const expires = dateFormatter.format(new Date(issued.expiresAt));
  const message = `Hi ${firstName}, your temporary Cashflow password is ${issued.tempPassword}. Sign in at ${typeof window === "undefined" ? "" : window.location.origin}/login and you will be asked to choose your own password. The temporary one stops working on ${expires}.`;

  return shell(
    <>
      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        {reason === "created" ? "Account created" : "Password reset"} for {issued.userName}
      </h3>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Give this temporary password to {firstName}. It is shown <strong>only once</strong>.
        Hand it over in person or by phone or chat, not by e-mail.
      </p>
      <p
        data-testid="temp-password"
        className="mt-4 select-all rounded-lg bg-zinc-100 px-4 py-3 text-center font-mono text-2xl font-semibold tracking-wider text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50"
      >
        {issued.tempPassword}
      </p>
      <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Valid until {expires}. They must choose their own password when they sign in.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => copy("password", issued.tempPassword)}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          {copied === "password" ? "Copied" : "Copy password"}
        </button>
        <button
          type="button"
          onClick={() => copy("message", message)}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          {copied === "message" ? "Copied" : "Copy message"}
        </button>
      </div>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
        >
          Done
        </button>
      </div>
    </>,
    "Temporary password",
  );
}
