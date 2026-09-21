"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AccountAvatar, AccountMenu } from "@/components/cashflow/account-menu";
import { AddExpenseModal } from "@/components/cashflow/add-expense-modal";
import { SignOutButton } from "@/components/cashflow/sign-out-button";
import { USER_ROLE_LABELS, type UserRole } from "@/lib/cashflow/user-schema";
import type { Branch } from "@/lib/db/branches";

const BASE_LINKS = [
  { href: "/cashflow", label: "Overview" },
  { href: "/cashflow/transactions", label: "Transactions" },
] as const;

// A dentist sees their own priority/commission here; a staff member sees
// their own bonus (see the Performance page's own role-based sectioning) —
// each role only ever sees its own numbers, never a ranked comparison
// against colleagues, so both get the same nav entry.
const DENTIST_LINKS = [{ href: "/cashflow/performance", label: "Performance" }] as const;
const STAFF_LINKS = [{ href: "/cashflow/performance", label: "Performance" }] as const;

const ADMIN_LINKS = [
  { href: "/cashflow/performance", label: "Performance" },
  { href: "/cashflow/commissions", label: "Commissions" },
  { href: "/cashflow/branches", label: "Branches" },
  { href: "/cashflow/users", label: "Users" },
] as const;

/**
 * The whole right-hand side of the app header: the nav links, the "Add
 * Expenses" CTA, the profile link, and the sign-out button. Below `md` the
 * admin link set (6 items total with Overview/Transactions) doesn't come
 * close to fitting a phone screen in one row, so this collapses into a
 * hamburger toggle and a full-width dropdown panel instead of overflowing
 * or wrapping mid-header. Bundled into one client component (rather than
 * nav/profile/sign-out staying separate pieces in the server-rendered
 * layout) so the open/close state can control all three at once.
 */
export function CashflowNav({
  role,
  displayName,
  email,
  branches,
}: {
  role: UserRole;
  displayName?: string;
  email?: string;
  branches: Branch[];
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const links =
    role === "admin"
      ? [...BASE_LINKS, ...ADMIN_LINKS]
      : role === "dentist"
        ? [...BASE_LINKS, ...DENTIST_LINKS]
        : [...BASE_LINKS, ...STAFF_LINKS];

  function isActive(href: string) {
    return href === "/cashflow" ? pathname === href : pathname.startsWith(href);
  }

  return (
    <>
      <nav className="hidden items-center gap-1 md:flex">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive(link.href)
                ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="hidden items-center gap-3 md:flex">
        <AddExpenseModal branches={branches} />
        {displayName ? (
          <AccountMenu role={role} displayName={displayName} email={email} />
        ) : (
          <SignOutButton />
        )}
      </div>

      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
        aria-controls="mobile-nav-panel"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        className="inline-flex items-center justify-center rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 md:hidden"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-6 w-6" aria-hidden="true">
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
          )}
        </svg>
      </button>

      {isOpen && (
        <div
          id="mobile-nav-panel"
          className="absolute inset-x-0 top-full z-40 border-b border-zinc-200 bg-white px-6 py-4 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 md:hidden"
        >
          <div className="mb-3">
            <AddExpenseModal branches={branches} />
          </div>
          <nav className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className={`rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            {displayName && (
              <div className="mb-3 flex items-center gap-3 px-1">
                <AccountAvatar displayName={displayName} />
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{displayName}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{USER_ROLE_LABELS[role]}</p>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1">
              {displayName && (
                <Link
                  href="/cashflow/profile"
                  onClick={() => setIsOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  Profile
                </Link>
              )}
              <SignOutButton variant="menu" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
