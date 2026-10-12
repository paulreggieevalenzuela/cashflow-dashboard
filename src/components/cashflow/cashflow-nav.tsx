"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountAvatar, AccountMenu } from "@/components/cashflow/account-menu";
import { SignOutButton } from "@/components/cashflow/sign-out-button";
import { USER_ROLE_LABELS, type UserRole } from "@/lib/cashflow/user-schema";

const BASE_LINKS = [
  { href: "/cashflow", label: "Overview" },
  { href: "/cashflow/queue", label: "Queue" },
  { href: "/cashflow/transactions", label: "Transactions" },
  { href: "/cashflow/patients", label: "Patients" },
] as const;

// A dentist sees their own priority/commission here; a staff member sees
// their own bonus (see the Performance page's own role-based sectioning) —
// each role only ever sees its own numbers, never a ranked comparison
// against colleagues, so both get the same nav entry.
const DENTIST_LINKS = [
  { href: "/cashflow/performance", label: "Performance" },
] as const;
const STAFF_LINKS = [
  { href: "/cashflow/performance", label: "Performance" },
] as const;

const ADMIN_LINKS = [
  { href: "/cashflow/performance", label: "Performance" },
  { href: "/cashflow/commissions", label: "Commissions" },
  { href: "/cashflow/branches", label: "Branches" },
  { href: "/cashflow/users", label: "Users" },
] as const;

/**
 * The whole right-hand side of the app header: the nav links, the profile link, and the sign-out button. Below `md` the
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
  openVisits = null,
}: {
  role: UserRole;
  displayName?: string;
  email?: string;
  /** Visits not Cleared yet (null = unknown). Shown next to "Queue". */
  openVisits?: number | null;
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const openCount = useOpenVisitCount(openVisits);

  const links =
    role === "admin"
      ? [...BASE_LINKS, ...ADMIN_LINKS]
      : role === "dentist"
        ? [...BASE_LINKS, ...DENTIST_LINKS]
        : [...BASE_LINKS, ...STAFF_LINKS];

  function badgeFor(href: string) {
    return href === "/cashflow/queue" && openCount !== null && openCount > 0
      ? openCount
      : null;
  }

  function isActive(href: string) {
    return href === "/cashflow" ? pathname === href : pathname.startsWith(href);
  }

  return (
    <>
      <nav className="hidden items-center gap-0.5 lg:flex">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
              isActive(link.href)
                ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {link.label}
            <CountBadge count={badgeFor(link.href)} />
          </Link>
        ))}
      </nav>

      <div className="hidden items-center gap-3 lg:flex">
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
        className="inline-flex items-center justify-center rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 lg:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          className="h-6 w-6"
          aria-hidden="true"
        >
          {isOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
            />
          )}
        </svg>
      </button>

      {isOpen && (
        <div
          id="mobile-nav-panel"
          className="absolute inset-x-0 top-full z-40 border-b border-zinc-200 bg-white px-6 py-4 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 lg:hidden"
        >
          <div className="mb-3">
              </div>
          <nav className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                }`}
              >
                {link.label}
                <CountBadge count={badgeFor(link.href)} />
              </Link>
            ))}
          </nav>
          <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            {displayName && (
              <div className="mb-3 flex items-center gap-3 px-1">
                <AccountAvatar displayName={displayName} />
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {displayName}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {USER_ROLE_LABELS[role]}
                  </p>
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

const POLL_MS = 45_000;

/**
 * The count of visits still open. Starts from the server-rendered number,
 * then re-checks every 45 seconds while the tab is visible, so the menu
 * stays roughly live on every page without a full refresh. A newer
 * server-rendered number (after a status change) always wins over an older
 * polled one.
 */
function useOpenVisitCount(initial: number | null): number | null {
  const [polled, setPolled] = useState<{
    value: number;
    base: number | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/cashflow/open-visits", {
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return;
        const data = (await response.json()) as { count: number | null };
        if (!cancelled && typeof data.count === "number") {
          setPolled({ value: data.count, base: initial });
        }
      } catch {
        // Offline, slow or signed out — keep showing the last number.
      }
    }
    const timer = window.setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [initial]);

  return polled && polled.base === initial ? polled.value : initial;
}

function CountBadge({ count }: { count: number | null }) {
  if (count === null) return null;
  return (
    <span
      className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-600 px-1.5 text-xs font-semibold leading-5 tabular-nums text-white"
      aria-label={`${count} open ${count === 1 ? "visit" : "visits"}`}
    >
      {count}
    </span>
  );
}
