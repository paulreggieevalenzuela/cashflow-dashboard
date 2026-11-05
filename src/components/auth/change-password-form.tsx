"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PasswordField } from "@/components/auth/password-field";
import { changePasswordAction } from "@/app/change-password/actions";
import { MIN_PASSWORD_LENGTH, passwordChecklist } from "@/lib/auth/password-policy";

type Errors = { current?: string; next?: string; confirm?: string };

/**
 * Change password. `forced` is the first-sign-in screen (the current password
 * is the temporary one, and there is nothing else to do until it is changed);
 * otherwise it sits on the Profile page. The server decides what really
 * applies; this only changes the wording.
 */
export function ChangePasswordForm({
  forced,
  compact = false,
}: {
  forced: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const checklist = passwordChecklist(next);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Errors = {};
    if (!current) nextErrors.current = forced ? "Enter the temporary password." : "Enter your current password.";
    if ([...next].length < MIN_PASSWORD_LENGTH) {
      nextErrors.next = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (next !== confirm) nextErrors.confirm = "The two passwords don't match.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    try {
      const result = await changePasswordAction({ current, next, confirm });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.fieldErrors ? null : result.message);
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      if (result.signInAgain) {
        await signOut({ redirect: false });
        router.replace("/login?reason=changed");
        router.refresh();
        return;
      }
      if (forced) {
        router.replace("/cashflow");
        router.refresh();
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-5" aria-label="Change password">
      {formError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {formError}
        </div>
      )}
      {done && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
        >
          Your password was changed. You were signed out of your other devices.
        </div>
      )}

      <PasswordField
        label={forced ? "Temporary password" : "Current password"}
        name="current"
        autoComplete="current-password"
        value={current}
        error={errors.current}
        onChange={(event) => setCurrent(event.target.value)}
      />
      <div>
        <PasswordField
          label="New password"
          name="new-password"
          autoComplete="new-password"
          value={next}
          error={errors.next}
          onChange={(event) => setNext(event.target.value)}
        />
        <ul className="mt-2 space-y-1 text-xs" aria-label="Password rules">
          {checklist.map((rule) => (
            <li
              key={rule.label}
              className={
                next
                  ? rule.ok
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-zinc-500 dark:text-zinc-400"
                  : "text-zinc-500 dark:text-zinc-400"
              }
            >
              {next ? (rule.ok ? "✓ " : "• ") : "• "}
              {rule.label}
            </li>
          ))}
          <li className="text-zinc-500 dark:text-zinc-400">
            • Spaces are fine: a few ordinary words together make a strong password
          </li>
        </ul>
      </div>
      <PasswordField
        label="Confirm new password"
        name="confirm-password"
        autoComplete="new-password"
        value={confirm}
        error={errors.confirm}
        onChange={(event) => setConfirm(event.target.value)}
      />

      <div className={compact ? "flex flex-wrap items-center gap-3" : "space-y-3"}>
        <button
          type="submit"
          disabled={busy}
          className={`flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70 ${
            compact ? "" : "w-full"
          }`}
        >
          {busy ? "Saving…" : forced ? "Save and continue" : "Change password"}
        </button>
        {forced && (
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full text-center text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Sign out instead
          </button>
        )}
      </div>
    </form>
  );
}
