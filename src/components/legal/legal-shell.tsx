import Link from "next/link";
import type { ReactNode } from "react";
import {
  CLINIC,
  LEGAL_LAST_UPDATED,
  LEGAL_TEXT_REVIEWED,
  isPlaceholder,
} from "@/lib/cashflow/legal";

export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Use" },
  { href: "/help", label: "Help & FAQ" },
  { href: "/contact", label: "Contact" },
] as const;

/** A clinic detail; unfilled placeholders are highlighted so nobody misses them. */
export function Detail({ value }: { value: string }) {
  if (isPlaceholder(value)) {
    return (
      <mark className="rounded bg-amber-100 px-1 font-medium text-amber-900 print:bg-transparent print:underline">
        [{value}]
      </mark>
    );
  }
  return <>{value}</>;
}

/** Small row of links used under the sign-in card and in the app footer. */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav
      aria-label="Legal and help"
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400 ${className}`}
    >
      {LEGAL_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="underline-offset-2 hover:text-amber-700 hover:underline dark:hover:text-amber-400"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Page frame for the public information pages (no sign-in needed, so a
 * patient or inspector can read them): logo, readable column, footer links.
 */
export function LegalShell({
  title,
  intro,
  showUpdated = true,
  children,
}: {
  title: string;
  intro?: string;
  showUpdated?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-amber-50/40 to-sky-50/60 print:bg-white dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur-sm print:border-0 dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="inline-flex items-center rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-zinc-200">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img src="/logo-wordmark.png" alt="ADT Dental Clinic" className="h-8 w-auto" />
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-amber-700 hover:text-amber-800 print:hidden dark:text-amber-400"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        {!LEGAL_TEXT_REVIEWED && (
          <p
            role="note"
            className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden"
          >
            Draft for the clinic to review. Highlighted items still need the
            clinic&apos;s details, and a legal adviser should approve the text
            before it is relied on.
          </p>
        )}
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        {showUpdated && (
          <p className="mt-1 text-sm text-zinc-500">Last updated {LEGAL_LAST_UPDATED}</p>
        )}
        {intro && (
          <p className="mt-4 text-base leading-7 text-zinc-600 dark:text-zinc-300">{intro}</p>
        )}
        <div className="mt-8 space-y-8 text-[15px] leading-7 text-zinc-700 dark:text-zinc-300">
          {children}
        </div>
      </main>

      <footer className="border-t border-zinc-200 py-6 print:hidden dark:border-zinc-800">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 sm:px-6">
          <LegalLinks />
          <p className="text-xs text-zinc-400">
            &copy; {new Date().getFullYear()} <Detail value={CLINIC.name} />
          </p>
        </div>
      </footer>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
      {children}
    </section>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-amber-500">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
