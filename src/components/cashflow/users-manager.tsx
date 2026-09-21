"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  createUserAction,
  deleteUserAction,
  updateUserBranchAction,
  updateUserRoleAction,
} from "@/app/cashflow/users/actions";
import { FormField } from "@/components/auth/form-field";
import { PasswordField } from "@/components/auth/password-field";
import { USER_ROLES, USER_ROLE_LABELS, type UserRole } from "@/lib/cashflow/user-schema";
import type { Branch } from "@/lib/db/branches";
import type { PublicUser } from "@/lib/db/users";

type FormState = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  branchId: string;
};

const INITIAL_STATE: FormState = {
  name: "",
  email: "",
  password: "",
  role: "staff",
  branchId: "",
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function UsersManager({
  users,
  currentUserId,
  branches,
}: {
  users: PublicUser[];
  currentUserId: string;
  branches: Branch[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

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
    router.refresh();
  }

  async function handleRoleChange(userId: string, role: UserRole) {
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

  async function handleDelete(user: PublicUser) {
    if (!window.confirm(`Remove ${user.name} (${user.email})? They will no longer be able to sign in.`)) {
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
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Add a user
        </h3>

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
            <PasswordField
              label="Temporary password"
              placeholder="At least 8 characters"
              value={form.password}
              error={errors.password}
              onChange={(event) => updateField("password", event.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Role
              </label>
              <select
                value={form.role}
                onChange={(event) => updateField("role", event.target.value as UserRole)}
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
                onChange={(event) => updateField("branchId", event.target.value)}
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
              {branches.length > 0 && <th className="px-4 py-3 font-medium">Branch</th>}
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
                      <span className="ml-2 text-xs font-normal text-zinc-400">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      disabled={isBusy || isSelf}
                      onChange={(event) =>
                        handleRoleChange(user.id, event.target.value as UserRole)
                      }
                      className="select-chevron-sm rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 outline-none disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    >
                      {USER_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {USER_ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </td>
                  {branches.length > 0 && (
                    <td className="px-4 py-3">
                      <select
                        value={user.branchId ?? ""}
                        disabled={isBusy}
                        onChange={(event) => handleBranchChange(user.id, event.target.value)}
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
                    <button
                      type="button"
                      onClick={() => handleDelete(user)}
                      disabled={isBusy || isSelf}
                      className="rounded-md px-2 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    >
                      {isBusy ? "Working..." : "Remove"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
