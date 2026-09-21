"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FormField } from "@/components/auth/form-field";
import { validateEmail } from "@/lib/validation";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextError = validateEmail(email);
    setError(nextError);

    if (nextError) {
      return;
    }

    setStatus("submitting");

    // TODO: replace with a real password-reset request.
    window.setTimeout(() => {
      setStatus("success");
    }, 900);
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Reset your password
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Enter the email address linked to your account and we&apos;ll send you a link to reset your password.
        </p>
      </div>

      {status === "success" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          If an account exists for {email}, you&apos;ll receive reset instructions shortly.
        </div>
      ) : (
        <form noValidate onSubmit={handleSubmit} className="space-y-5">
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
            {status === "submitting" ? "Sending link..." : "Send reset link"}
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
