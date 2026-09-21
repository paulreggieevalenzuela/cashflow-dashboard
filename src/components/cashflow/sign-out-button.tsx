"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** `"button"` (default) is the bordered pill used on its own; `"menu"` is a
 * full-width, left-aligned row styled to sit inside a menu/list (e.g. the
 * mobile nav panel), matching the other rows around it. */
export function SignOutButton({ variant = "button" }: { variant?: "button" | "menu" }) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut({ redirect: false });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  const className =
    variant === "menu"
      ? "w-full rounded-md px-3 py-2.5 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/40"
      : "rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

  return (
    <button type="button" onClick={handleSignOut} disabled={isSigningOut} className={className}>
      {isSigningOut ? "Signing out..." : "Sign out"}
    </button>
  );
}
