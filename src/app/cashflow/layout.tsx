import type { Metadata } from "next";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { CashflowNav } from "@/components/cashflow/cashflow-nav";
import { RouteFocusManager } from "@/components/navigation/route-focus-manager";
import { listBranches } from "@/lib/db/branches";

export const metadata: Metadata = {
  title: {
    template: "%s | ADT Dental Clinic",
    default: "ADT Dental Clinic",
  },
};

export default async function CashflowLayout({ children }: { children: ReactNode }) {
  const [session, branches] = await Promise.all([auth(), listBranches()]);
  const role = session?.user.role ?? "staff";
  const displayName = session?.user.name ?? session?.user.email ?? "";
  const email = session?.user.email ?? undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/40 via-white to-sky-50/50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
      {/* `relative` gives the mobile nav panel (rendered by CashflowNav,
          `absolute inset-x-0 top-full` below `md`) something to anchor to,
          so it overlays the page instead of pushing content down. */}
      <header className="relative border-b border-zinc-200 bg-white/80 backdrop-blur-sm print:hidden dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {/* White chip behind the logo regardless of light/dark mode — the
              logo art has a black outline that would disappear against the
              header's dark:bg-zinc-950 background otherwise. */}
          <span className="inline-flex items-center rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-zinc-200">
            {/* eslint-disable-next-line @next/next/no-img-element -- static
                brand asset from /public, not worth next/image's overhead here */}
            <img src="/logo-wordmark.png" alt="ADT Dental Clinic" className="h-8 w-auto sm:h-9" />
          </span>
          <CashflowNav
            role={role}
            displayName={displayName || undefined}
            email={email}
            branches={branches}
          />
        </div>
      </header>

      {/* Moves focus here after every client-side route change so screen
          reader users get an announcement — see RouteFocusManager. */}
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 py-6 outline-none sm:px-6 sm:py-8 print:max-w-none print:p-0"
      >
        {children}
      </main>
      <RouteFocusManager />
    </div>
  );
}
