"use client";

import { useId, type InputHTMLAttributes } from "react";

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
  /** Shows a red asterisk after the label for fields the clinic considers
   * essential to fill in — a visual cue only, not extra validation (the
   * zod schema is still the source of truth for what's actually required). */
  required?: boolean;
};

export function FormField({
  label,
  error,
  id,
  className,
  required,
  ...props
}: FormFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-red-500" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors placeholder:text-zinc-400 focus:ring-2 focus:ring-offset-0 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500 disabled:shadow-none dark:bg-zinc-900 dark:text-zinc-50 dark:disabled:bg-zinc-900/60 dark:disabled:text-zinc-500 ${
          error
            ? "border-red-400 focus:border-red-500 focus:ring-red-100 dark:focus:ring-red-900/40"
            : "border-zinc-300 focus:border-amber-500 focus:ring-amber-100 dark:border-zinc-700 dark:focus:ring-amber-900/40"
        } ${className ?? ""}`}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
