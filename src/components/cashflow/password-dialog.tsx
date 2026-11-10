"use client";

import { useState, type ReactNode } from "react";
import type { TempPasswordIssued } from "@/app/cashflow/users/actions";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export type PasswordDialogState =
  | { kind: "confirm-reset"; userId: string; userName: string; email: string }
  | { kind: "issued"; reason: "created" | "reset"; issued: TempPasswordIssued }
  | null;

/**
 * One window for both steps: confirm a reset, then show the temporary
 * password. The password exists only in this window's memory; closing it
 * loses it (reset again to get a new one).
 */
export function PasswordDialog({
  dialog,
  busy,
  error,
  onConfirmReset,
  onClose,
}: {
  dialog: NonNullable<PasswordDialogState>;
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
