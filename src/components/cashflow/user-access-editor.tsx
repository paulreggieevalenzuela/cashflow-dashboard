"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  deleteUserAction,
  resetUserPasswordAction,
  saveUserAccessAction,
  updateUserProfileAction,
} from "@/app/cashflow/users/actions";
import { FormField } from "@/components/auth/form-field";
import {
  PasswordDialog,
  type PasswordDialogState,
} from "@/components/cashflow/password-dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  PERMISSION_GROUPS,
  roleDefaults,
  worksInEveryClinic,
  type Permission,
} from "@/lib/auth/permissions";
import { USER_ROLE_LABELS, type AssignableRole, type UserRole } from "@/lib/cashflow/user-schema";
import type { Branch } from "@/lib/db/branches";

export type EditableUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  mustChangePassword: boolean;
  tempPasswordExpiresAt: string | null;
  tempPasswordExpired: boolean;
};

type Tab = "personal" | "access" | "account";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "personal", label: "Personal Information" },
  { key: "access", label: "Access & Permissions" },
  { key: "account", label: "Account Settings" },
];

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

const SELECT_CLASS =
  "select-chevron w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40";

const PRIMARY_BUTTON =
  "inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70";

const SECONDARY_BUTTON =
  "inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

function sameSet(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((item) => b.includes(item));
}

/**
 * One person's screen, laid out in three tabs. "Access & Permissions" is the
 * heart of it: the role gives a starting set of privileges and each one can
 * then be ticked on or off for this person alone.
 */
export function UserAccessEditor({
  user,
  branches,
  initialRole,
  initialBranchIds,
  initialPermissions,
  roleChoices,
  grantable,
  canReset,
  canRemove,
}: {
  user: EditableUser;
  branches: Branch[];
  initialRole: UserRole;
  initialBranchIds: string[];
  initialPermissions: Permission[];
  /** Roles the viewer may give (the person's current role is always included). */
  roleChoices: UserRole[];
  /** Privileges the viewer may switch ON; null = all (the superuser). */
  grantable: Permission[] | null;
  canReset: boolean;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("personal");

  // Personal information
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [profileErrors, setProfileErrors] = useState<{ name?: string; email?: string }>({});
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Access
  const [role, setRole] = useState<UserRole>(initialRole);
  const [branchIds, setBranchIds] = useState<string[]>(initialBranchIds);
  const [permissions, setPermissions] = useState<Permission[]>(initialPermissions);
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessMessage, setAccessMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Account
  const [dialog, setDialog] = useState<PasswordDialogState>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const defaults = roleDefaults(role);
  const differs = permissions.filter((key) => !defaults.includes(key)).length +
    defaults.filter((key) => !permissions.includes(key)).length;
  const everyClinic = worksInEveryClinic(role);
  const mayGrant = (key: Permission) => grantable === null || grantable.includes(key);

  function changeRole(next: UserRole) {
    setRole(next);
    // A new role starts from that role's defaults.
    setPermissions(roleDefaults(next));
    setAccessMessage(null);
  }

  function toggleClinic(id: string) {
    setBranchIds((prev) =>
      prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id],
    );
  }

  function togglePermission(key: Permission) {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((existing) => existing !== key) : [...prev, key],
    );
  }

  function setGroup(keys: readonly Permission[], on: boolean) {
    setPermissions((prev) => {
      const without = prev.filter((key) => !keys.includes(key));
      if (!on) return without;
      return [
        ...without,
        ...keys.filter((key) => mayGrant(key) || prev.includes(key)),
      ];
    });
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileErrors({});
    setProfileMessage(null);
    try {
      const result = await updateUserProfileAction(user.id, { name, email });
      if (!result.ok) {
        setProfileMessage({ ok: false, text: result.message });
        if (result.fieldErrors) setProfileErrors(result.fieldErrors);
        return;
      }
      setProfileMessage({ ok: true, text: "Saved." });
      router.refresh();
    } finally {
      setProfileBusy(false);
    }
  }

  async function saveAccess() {
    setAccessBusy(true);
    setAccessMessage(null);
    try {
      const result = await saveUserAccessAction(user.id, {
        role: role as AssignableRole,
        branchIds,
        permissions,
      });
      if (!result.ok) {
        setAccessMessage({ ok: false, text: result.message });
        return;
      }
      setAccessMessage({ ok: true, text: "Saved. It applies the next time they open a page." });
      router.refresh();
    } finally {
      setAccessBusy(false);
    }
  }

  async function handleReset() {
    setDialogBusy(true);
    setDialogError(null);
    try {
      const result = await resetUserPasswordAction(user.id);
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

  async function handleRemove() {
    if (
      !window.confirm(
        `Remove ${user.name} (${user.email})? They will no longer be able to sign in.`,
      )
    ) {
      return;
    }
    setRemoveBusy(true);
    setAccountError(null);
    try {
      const result = await deleteUserAction(user.id);
      if (!result.ok) {
        setAccountError(result.message);
        return;
      }
      router.push("/cashflow/users");
      router.refresh();
    } finally {
      setRemoveBusy(false);
    }
  }

  const message = (value: { ok: boolean; text: string } | null) =>
    value && (
      <p
        role={value.ok ? "status" : "alert"}
        className={`text-sm ${value.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
      >
        {value.text}
      </p>
    );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/cashflow/users"
          className="text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
        >
          ← Back to users
        </Link>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Update staff details and clinics
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {user.name} · {USER_ROLE_LABELS[user.role]}
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Staff details"
        className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800"
      >
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`tab-${item.key}`}
            aria-selected={tab === item.key}
            aria-controls={`panel-${item.key}`}
            onClick={() => setTab(item.key)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === item.key
                ? "border-amber-600 text-amber-700 dark:text-amber-400"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "personal" && (
        <section
          role="tabpanel"
          id="panel-personal"
          aria-labelledby="tab-personal"
          className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <form onSubmit={saveProfile} noValidate className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                label="Full name"
                type="text"
                value={name}
                error={profileErrors.name}
                onChange={(event) => setName(event.target.value)}
              />
              <FormField
                label="Email (used to sign in)"
                type="email"
                value={email}
                error={profileErrors.email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {message(profileMessage)}
            <button type="submit" disabled={profileBusy} className={PRIMARY_BUTTON}>
              {profileBusy && <Spinner />}
              {profileBusy ? "Saving..." : "Save details"}
            </button>
          </form>
        </section>
      )}

      {tab === "access" && (
        <section
          role="tabpanel"
          id="panel-access"
          aria-labelledby="tab-access"
          className="space-y-6"
        >
          <div className="grid grid-cols-1 gap-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950 lg:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="user-role"
                className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Role
              </label>
              <select
                id="user-role"
                value={role}
                onChange={(event) => changeRole(event.target.value as UserRole)}
                className={SELECT_CLASS}
              >
                {roleChoices.map((choice) => (
                  <option key={choice} value={choice}>
                    {USER_ROLE_LABELS[choice]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                The role is the starting point. Changing it resets the privileges
                below to that role&apos;s defaults; you can then tick or untick
                any of them for this person.
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Authorized clinics
              </legend>
              {everyClinic ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {USER_ROLE_LABELS[role]}s work in every clinic.
                </p>
              ) : branches.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No clinics yet. Add them under Branches.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {branches.map((branch) => (
                      <label
                        key={branch.id}
                        className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                      >
                        <input
                          type="checkbox"
                          checked={branchIds.includes(branch.id)}
                          onChange={() => toggleClinic(branch.id)}
                          className="h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                        />
                        {branch.name}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    The first clinic ticked is their home clinic: their visits,
                    Queue and Overview start there. With none ticked they can&apos;t add visits.
                  </p>
                </>
              )}
            </fieldset>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  System privileges
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {differs === 0
                    ? `Exactly the ${USER_ROLE_LABELS[role]} defaults.`
                    : `${differs} ${differs === 1 ? "privilege differs" : "privileges differ"} from the ${USER_ROLE_LABELS[role]} defaults (marked below).`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPermissions(roleDefaults(role))}
                disabled={differs === 0 || accessBusy}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Reset to role defaults
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
              {PERMISSION_GROUPS.map((group) => {
                const keys = group.permissions.map((entry) => entry.key as Permission);
                return (
                  <fieldset key={group.title} className="space-y-2">
                    <legend className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      <span>{group.title}</span>
                      <span className="space-x-2 font-normal normal-case tracking-normal">
                        <button
                          type="button"
                          onClick={() => setGroup(keys, true)}
                          className="text-amber-700 hover:underline dark:text-amber-400"
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => setGroup(keys, false)}
                          className="text-zinc-500 hover:underline dark:text-zinc-400"
                        >
                          None
                        </button>
                      </span>
                    </legend>
                    {group.permissions.map((entry) => {
                      const key = entry.key as Permission;
                      const checked = permissions.includes(key);
                      const isDefault = defaults.includes(key);
                      const locked = !checked && !mayGrant(key);
                      return (
                        <label
                          key={key}
                          title={locked ? "You don't have this privilege yourself, so you can't give it." : undefined}
                          className={`flex items-start gap-2.5 text-sm ${locked ? "opacity-50" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={locked}
                            onChange={() => togglePermission(key)}
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                          />
                          <span className="min-w-0">
                            <span className="text-zinc-800 dark:text-zinc-200">{entry.label}</span>
                            {checked !== isDefault && (
                              <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                {checked ? "extra" : "removed"}
                              </span>
                            )}
                            {"hint" in entry && entry.hint && (
                              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                                {entry.hint}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </fieldset>
                );
              })}
            </div>
          </div>

          {message(accessMessage)}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={saveAccess} disabled={accessBusy} className={PRIMARY_BUTTON}>
              {accessBusy && <Spinner />}
              {accessBusy ? "Saving..." : "Save access"}
            </button>
            <Link href="/cashflow/users" className={SECONDARY_BUTTON}>
              Back to users
            </Link>
            {role !== initialRole || !sameSet(permissions, initialPermissions) || !sameSet(branchIds, initialBranchIds) ? (
              <span className="text-xs text-amber-700 dark:text-amber-300">Unsaved changes</span>
            ) : null}
          </div>
        </section>
      )}

      {tab === "account" && (
        <section
          role="tabpanel"
          id="panel-account"
          aria-labelledby="tab-account"
          className="space-y-6"
        >
          <dl className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-200 bg-white p-6 text-sm dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">Member since</dt>
              <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">
                {dateFormatter.format(new Date(user.createdAt))}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">Password</dt>
              <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">
                {user.mustChangePassword
                  ? user.tempPasswordExpired
                    ? "Temporary one expired"
                    : "Temporary: they must choose their own"
                  : "Chosen by the person"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">Role</dt>
              <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{USER_ROLE_LABELS[user.role]}</dd>
            </div>
          </dl>

          {accountError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {accountError}
            </p>
          )}

          {canReset && (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Reset password</h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Gives {user.name} a new temporary password (shown once). They are signed out of every device and must choose their own at the next sign-in.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDialogError(null);
                  setDialog({ kind: "confirm-reset", userId: user.id, userName: user.name, email: user.email });
                }}
                className={`${SECONDARY_BUTTON} mt-4`}
              >
                Reset password
              </button>
            </div>
          )}

          {canRemove && (
            <div className="rounded-xl border border-red-200 bg-red-50/40 p-6 dark:border-red-900 dark:bg-red-950/20">
              <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">Remove account</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                They can no longer sign in. Their past visits and payments stay as they are.
              </p>
              <button
                type="button"
                onClick={handleRemove}
                disabled={removeBusy}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:bg-zinc-900 dark:text-red-300"
              >
                {removeBusy && <Spinner />}
                {removeBusy ? "Removing..." : "Remove this account"}
              </button>
            </div>
          )}
        </section>
      )}

      {dialog && (
        <PasswordDialog
          dialog={dialog}
          busy={dialogBusy}
          error={dialogError}
          onConfirmReset={() => dialog.kind === "confirm-reset" && handleReset()}
          onClose={() => {
            setDialog(null);
            setDialogError(null);
          }}
        />
      )}
    </div>
  );
}
