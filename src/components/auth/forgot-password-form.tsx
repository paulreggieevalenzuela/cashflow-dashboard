"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { requestPasswordResetAction } from "@/app/forgot-password/actions";
import { FormField } from "@/components/auth/form-field";
import { validateEmail } from "@/lib/validation";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const nextError = validateEmail(email);
    setError(nextError);

    if (nextError) {
      return;
    }

    setStatus("submitting");
    try {
      const result = await requestPasswordResetAction({ email, note });
      if (!result.ok) {
        setStatus("idle");
        setError(result.message);
        return;
      }
      setStatus("success");
    } catch {
      setStatus("idle");
      setFormError("Something went wrong. Please try again.");
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Forgot your password?
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Enter the e-mail address of your account. An admin will check that it
          is you and give you a temporary password. You will choose your own
          the next time you sign in.
        </p>
      </div>

      {status === "success" ? (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          Request sent. An admin will contact you with a temporary password. If
          it is urgent, ask your branch admin directly.
        </div>
      ) : (
        <form noValidate onSubmit={handleSubmit} className="space-y-5">
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            >
              {formError}
            </div>
          )}
          <FormField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@practice.com"
            value={email}
            error={error}
            onChange={(event) => setEmail(event.target.value)}
          />
          <FormField
            label="Note for the admin (optional)"
            name="note"
            type="text"
            maxLength={300}
            placeholder="For example: I'm at the Marikina branch, phone 09..."
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />

          <button
            type="submit"
            disabled={status === "submitting"}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {status === "submitting" && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z" />
              </svg>
            )}
            {status === "submitting" ? "Sending request..." : "Request a reset"}
          </button>
        </form>
      )}

      <p className="mt-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Remembered your password?{" "}
        <Link href="/login" className="font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
