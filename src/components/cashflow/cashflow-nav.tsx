"use client";

import Link from "next/link";
import { SHOW_STAFF_PERFORMANCE } from "@/lib/cashflow/features";
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

/** A link that shows only for people with a privilege. Everyone sees
 * Performance (a dentist or staff member sees only their own numbers there,
 * see the page's own sectioning). */
const PERMISSION_LINKS = [
  { href: "/cashflow/performance", label: "Performance", permission: null },
  { href: "/cashflow/commissions", label: "Commissions", permission: "commission.manage" },
  { href: "/cashflow/branches", label: "Branches", permission: "branch.manage" },
  { href: "/cashflow/users", label: "Users", permission: "user.manage" },
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
  permissions = [],
  isSuperuser = false,
  deletedCount = null,
  displayName,
  email,
  openVisits = null,
  resetRequests = 0,
}: {
  role: UserRole;
  /** What this person may do (the menu shows only what they can open). */
  permissions?: readonly string[];
  /** Shows "Deleted items" in the profile menu (superuser only, never in the nav). */
  isSuperuser?: boolean;
  /** Items waiting in Deleted items (superuser only; null = unknown / not set up). */
  deletedCount?: number | null;
  displayName?: string;
  email?: string;
  /** Visits not Cleared yet (null = unknown). Shown next to "Queue". */
  openVisits?: number | null;
  /** Password reset requests waiting for this admin (shown next to "Users"). */
  resetRequests?: number;
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const openCount = useOpenVisitCount(openVisits);

  const links = [
    ...BASE_LINKS,
    ...PERMISSION_LINKS.filter((link) => {
      if (link.permission === null) {
        // Staff see Performance only while staff performance is shown.
        return role !== "staff" || SHOW_STAFF_PERFORMANCE || permissions.includes("performance.view_all");
      }
      // Users is only for admins, owners and the superuser, even if the
      // privilege was ticked for somebody else.
      if (link.permission === "user.manage" && role !== "admin" && role !== "owner" && role !== "superuser") {
        return false;
      }
      return permissions.includes(link.permission);
    }),
  ];

  function badgeFor(href: string) {
    // Always shown for the Queue (0 included) so the menu stays an indicator.
    if (href === "/cashflow/users") return resetRequests > 0 ? resetRequests : null;
    return href === "/cashflow/queue" && openCount !== null ? openCount : null;
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
            <CountBadge count={badgeFor(link.href)} unit={link.href === "/cashflow/users" ? "password request" : "open visit"} />
          </Link>
        ))}
      </nav>

      <div className="hidden items-center gap-3 lg:flex">
        {displayName ? (
          <AccountMenu
            role={role}
            displayName={displayName}
            email={email}
            isSuperuser={isSuperuser}
            deletedCount={deletedCount}
          />
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
                <CountBadge count={badgeFor(link.href)} unit={link.href === "/cashflow/users" ? "password request" : "open visit"} />
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
              {displayName && isSuperuser && (
                <Link
                  href="/cashflow/trash"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  Deleted items
                  <CountBadge count={deletedCount} unit="deleted item" />
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

function CountBadge({ count, unit }: { count: number | null; unit: string }) {
  if (count === null) return null;
  return (
    <span
      className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold leading-5 tabular-nums ${
        count > 0
          ? "bg-amber-600 text-white"
          : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
      }`}
      aria-label={`${count} ${unit}${count === 1 ? "" : "s"}`}
    >
      {count}
    </span>
  );
}
