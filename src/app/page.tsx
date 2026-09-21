import Link from "next/link";

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-white via-amber-50/40 to-sky-50/60 px-6 py-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-amber-100/50 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-sky-100/50 blur-3xl"
      />

      <main className="relative flex w-full max-w-xl flex-col items-center gap-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- static
            brand asset from /public, not worth next/image's overhead here */}
        <img
          src="/logo-wordmark.png"
          alt="ADT Dental Clinic"
          className="h-16 w-auto"
        />
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-amber-600">
            Financial and Cashflow Management for dental practices
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">
            Track your practice&apos;s Financials and Cashflow in one place
          </h1>
        </div>
        <p className="max-w-md text-base leading-7 text-zinc-600">
          Record patient payments, import CSV batches, and see income trends at
          a glance — with role-based access for admins, dentists, and staff.
        </p>
        <Link
          href="/login"
          className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700"
        >
          Sign in
        </Link>
      </main>
    </div>
  );
}
