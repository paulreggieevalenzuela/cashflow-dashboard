"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/ui/spinner";

/**
 * A submit button that shows a spinner and a "working" label while its form
 * (a server action) is running, and cannot be pressed twice. Must be inside
 * the <form>. `disabled` keeps the button off for other reasons.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "",
  disabled = false,
}: {
  children: ReactNode;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={`inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {pending && <Spinner />}
      <span>{pending ? pendingLabel : children}</span>
    </button>
  );
}
