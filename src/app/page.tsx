import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ADT Dental Clinic · Financial & Cashflow Management",
  description:
    "The clinic's own system for the patient queue, payments, HMO billing, day end, commissions and approvals.",
};

/*
 * The public landing page (signed-in people are sent to /cashflow by the
 * proxy). A server component with CSS-only motion: no client JavaScript,
 * and every animation stops for people who ask for reduced motion
 * (see the "landing" section of globals.css).
 */

const QUEUE_STEPS = [
  { label: "Arrived", tone: "bg-sky-100 text-sky-800" },
  { label: "On-going", tone: "bg-violet-100 text-violet-800" },
  { label: "For Payment", tone: "bg-amber-100 text-amber-800" },
  { label: "Cleared", tone: "bg-emerald-100 text-emerald-800" },
] as const;

const FEATURES = [
  {
    title: "Patient queue",
    text: "Check patients in and follow every visit from Arrived to Cleared, with waiting times on each step.",
    icon: "queue",
  },
  {
    title: "Visits & payments",
    text: "Procedures from the price list, discounts, PWD / Senior rules, VAT and card fees worked out for you.",
    icon: "receipt",
  },
  {
    title: "HMO billing",
    text: "Patient HMO details, LOA tracking and a numbered billing per HMO and cut-off, ready to print or download.",
    icon: "shield",
  },
  {
    title: "Day end report",
    text: "Every payment of the day by method, with HMO amounts on the same row and the branch totals below.",
    icon: "calendar",
  },
  {
    title: "Dentist commissions",
    text: "Tier and own rates, transferred patients split 50 / 50, and every saved visit updated when a rate changes.",
    icon: "chart",
  },
  {
    title: "Checks & audit trail",
    text: "Branch manager and Headquarters approvals, locked visits, and a searchable record of who changed what.",
    icon: "check",
  },
] as const;

const FLOW = [
  { step: "Check in", text: "Front desk adds the visit" },
  { step: "Treat", text: "Dentist records the procedures" },
  { step: "Pay or bill", text: "Cash, card, e-wallet or HMO" },
  { step: "Approve", text: "Branch manager, then Headquarters" },
] as const;

function Icon({ name }: { name: (typeof FEATURES)[number]["icon"] }) {
  const common = {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-5 w-5",
    "aria-hidden": true,
  };
  switch (name) {
    case "queue":
      return (
        <svg {...common}>
          <path d="M4 6h16M4 12h10M4 18h6" />
          <circle cx="19" cy="15" r="3" />
        </svg>
      );
    case "receipt":
      return (
        <svg {...common}>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
          <path d="M9 8h6M9 12h6" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
          <path d="M12 9v6M9 12h6" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M9 12l2 2 4-4" />
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
        </svg>
      );
  }
}

/** A simple tooth outline, the clinic's motif. */
function ToothMark({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M15 6c-5 0-9 4-9 10 0 5 2 8 3 12 1 5 2 14 6 14 3 0 3-8 5-12 1-2 2-3 4-3s3 1 4 3c2 4 2 12 5 12 4 0 5-9 6-14 1-4 3-7 3-12 0-6-4-10-9-10-4 0-6 2-9 2s-5-2-9-2z" />
    </svg>
  );
}

/** The animated preview: a visit moving through the queue, and today's totals. */
function AppPreview() {
  return (
    <div className="landing-float relative mx-auto w-full max-w-md">
      <div
        aria-hidden="true"
        className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-sky-200/50 via-white to-amber-200/50 blur-2xl"
      />
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl shadow-sky-900/5">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 landing-pulse" />
            <span className="text-xs font-semibold text-zinc-700">Today · Marikina</span>
          </div>
          <span className="text-[11px] font-medium text-zinc-400">Queue</span>
        </div>

        {/* A visit card travelling through the four steps. */}
        <div className="px-5 pt-5">
          <div className="grid grid-cols-4 gap-1.5 text-center">
            {QUEUE_STEPS.map((step) => (
              <span
                key={step.label}
                className={`rounded-md px-1 py-1 text-[10px] font-semibold sm:text-[11px] ${step.tone}`}
              >
                {step.label}
              </span>
            ))}
          </div>
          <div className="relative mt-3 h-14">
            <div className="absolute inset-x-[12.5%] top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-zinc-100" />
            <div className="landing-track-fill absolute left-[12.5%] top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-sky-400 via-amber-400 to-emerald-400" />
            <div className="landing-visit absolute top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white py-1 pl-1 pr-3 shadow-md">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-[10px] font-bold text-white">
                  JR
                </span>
                <span className="whitespace-nowrap text-[11px] font-medium text-zinc-700">
                  Oral Prophylaxis
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 p-5">
          <div className="rounded-xl bg-zinc-50 p-3.5">
            <p className="text-[11px] font-medium text-zinc-500">Collected today</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">₱48,350</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200">
              <div className="landing-bar h-full rounded-full bg-emerald-500" />
            </div>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3.5">
            <p className="text-[11px] font-medium text-zinc-500">Billed to HMOs</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">₱12,700</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {["Maxicare", "Medicard", "Intellicare"].map((name, index) => (
                <span
                  key={name}
                  className="landing-chip rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold text-sky-800"
                  style={{ animationDelay: `${0.4 + index * 0.25}s` }}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
          <div className="col-span-2 flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/70 px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <span className="landing-pop flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
              <div>
                <p className="text-xs font-semibold text-emerald-900">Checked by the Branch manager</p>
                <p className="text-[11px] text-emerald-700">Waiting for Headquarters</p>
              </div>
            </div>
            <span className="text-[11px] font-medium text-emerald-700">Locked</span>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-zinc-500">Illustration. Figures are examples.</p>
    </div>
  );
}

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-white text-zinc-900">
      {/* Soft clinical background: two slow-moving glows and a faint grid. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-0">
        <div className="landing-glow absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-sky-100/70 blur-3xl" />
        <div className="landing-glow-alt absolute -right-32 top-24 h-[24rem] w-[24rem] rounded-full bg-amber-100/60 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(14,116,144,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(14,116,144,0.05)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/logo-wordmark.png" alt="ADT Dental Clinic" className="h-10 w-auto sm:h-11" />
        <Link
          href="/login"
          className="rounded-lg border border-zinc-300 bg-white/80 px-4 py-2 text-sm font-semibold text-zinc-800 backdrop-blur transition-colors hover:border-amber-500 hover:text-amber-700"
        >
          Sign in
        </Link>
      </header>

      <main className="relative z-10 flex-1">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-24 lg:pt-12">
          <div className="text-center lg:text-left">
            <p className="landing-rise inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
              <ToothMark className="h-3.5 w-3.5" />
              Financial &amp; Cashflow Management · ADT Dental Clinic
            </p>
            <h1
              className="landing-rise mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-zinc-900 sm:text-5xl"
              style={{ animationDelay: "0.08s" }}
            >
              Every visit, payment and HMO claim,{" "}
              <span className="bg-gradient-to-r from-sky-600 via-teal-600 to-amber-600 bg-clip-text text-transparent">
                in one clear place.
              </span>
            </h1>
            <p
              className="landing-rise mx-auto mt-5 max-w-xl text-base leading-7 text-zinc-600 lg:mx-0"
              style={{ animationDelay: "0.16s" }}
            >
              From check-in to the day&apos;s close: the patient queue, payments
              and HMO billing, day end, dentist commissions and two-step
              approvals, for every branch.
            </p>
            <div
              className="landing-rise mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start"
              style={{ animationDelay: "0.24s" }}
            >
              <Link
                href="/login"
                className="group inline-flex items-center gap-2 rounded-xl bg-amber-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-600/20 transition-all hover:-translate-y-0.5 hover:bg-amber-700"
              >
                Sign in to the clinic system
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M3 10a.75.75 0 0 1 .75-.75h10.64L10.2 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.19-3.96H3.75A.75.75 0 0 1 3 10Z"
                    clipRule="evenodd"
                  />
                </svg>
              </Link>
              <a
                href="#features"
                className="rounded-xl px-5 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100"
              >
                See what it does
              </a>
            </div>
            <p
              className="landing-rise mt-6 text-xs text-zinc-500"
              style={{ animationDelay: "0.32s" }}
            >
              For ADT Dental Clinic staff, dentists and managers. Accounts are
              given by the clinic.
            </p>
          </div>

          <div className="landing-rise" style={{ animationDelay: "0.2s" }}>
            <AppPreview />
          </div>
        </section>

        {/* Flow */}
        <section className="border-y border-zinc-100 bg-zinc-50/60">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
              From check-in to approval
            </p>
            <ol className="relative mt-8 grid gap-6 sm:grid-cols-4 sm:gap-4">
              <div
                aria-hidden="true"
                className="absolute left-[12.5%] right-[12.5%] top-5 hidden h-0.5 overflow-hidden rounded-full bg-zinc-200 sm:block"
              >
                <div className="landing-flow h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-teal-500 to-transparent" />
              </div>
              {FLOW.map((item, index) => (
                <li key={item.step} className="relative flex flex-col items-center text-center">
                  <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-teal-200 bg-white text-sm font-semibold text-teal-700 shadow-sm">
                    {index + 1}
                  </span>
                  <span className="mt-3 text-sm font-semibold text-zinc-900">{item.step}</span>
                  <span className="mt-1 text-xs text-zinc-500">{item.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 py-16 sm:px-6 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
              Built around how the clinic works
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Each part follows the clinic&apos;s own sheets and rules, so the
              front desk, the dentists and the managers see the same numbers.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <div
                key={feature.title}
                className="landing-rise group rounded-2xl border border-zinc-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-lg hover:shadow-teal-900/5"
                style={{ animationDelay: `${0.1 + index * 0.06}s` }}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700 transition-colors group-hover:bg-teal-600 group-hover:text-white">
                  <Icon name={feature.icon} />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-zinc-900">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-zinc-600">{feature.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Trust */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-700 via-sky-800 to-slate-900 px-6 py-10 text-white sm:px-10">
            <ToothMark className="landing-float-slow absolute -bottom-16 -left-10 h-48 w-48 text-white/[0.07]" />
            <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Patient and money records, handled with care</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-sky-100">
                  Each person sees only what their role allows, checked visits
                  are locked, and every change is written to the audit trail.
                </p>
              </div>
              <ul className="grid gap-2.5 text-sm text-sky-50">
                {[
                  "Role-based access per person and clinic",
                  "Two-step approval: Branch manager, then Headquarters",
                  "Searchable audit trail of every change",
                  "Sign-in protection and automatic sign-out when idle",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/15">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-zinc-100">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-zinc-500 sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} ADT Dental Clinic</p>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-4">
            <Link href="/privacy" className="hover:text-zinc-800">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-zinc-800">Terms of Use</Link>
            <Link href="/help" className="hover:text-zinc-800">Help &amp; FAQ</Link>
            <Link href="/contact" className="hover:text-zinc-800">Contact</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
