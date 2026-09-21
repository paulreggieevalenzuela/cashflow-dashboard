"use client";

import { useId, type SelectHTMLAttributes } from "react";

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  label: string;
  error?: string | null;
  placeholder: string;
  options: readonly string[];
  /** Shows a red asterisk after the label for fields the clinic considers
   * essential to fill in — a visual cue only, not extra validation (the
   * zod schema is still the source of truth for what's actually required). */
  required?: boolean;
};

export function SelectField({
  label,
  error,
  id,
  className,
  placeholder,
  options,
  required,
  ...props
}: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={selectId}
        className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-red-500" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <select
        id={selectId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:ring-2 focus:ring-offset-0 dark:bg-zinc-900 dark:text-zinc-50 ${
          error
            ? "border-red-400 focus:border-red-500 focus:ring-red-100 dark:focus:ring-red-900/40"
            : "border-zinc-300 focus:border-amber-500 focus:ring-amber-100 dark:border-zinc-700 dark:focus:ring-amber-900/40"
        } ${className ?? ""}`}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
