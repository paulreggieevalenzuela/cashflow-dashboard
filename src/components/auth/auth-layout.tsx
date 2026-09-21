import type { ReactNode } from "react";
import { ToothIcon } from "@/components/icons/tooth-icon";

type AuthLayoutProps = {
  heroEyebrow?: string;
  heroTitle: string;
  heroDescription: string;
  heroHighlights?: string[];
  children: ReactNode;
};

export function AuthLayout({
  heroEyebrow = "Cashflow for dental practices",
  heroTitle,
  heroDescription,
  heroHighlights = [],
  children,
}: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Hero panel — light, airy pastel wash instead of a dark saturated
          gradient, closer to what modern dental practice sites use: lots of
          white space, soft mint/sky tones, a friendly floating trust card. */}
      <section className="relative isolate hidden overflow-hidden bg-gradient-to-br from-amber-50 via-cyan-50 to-sky-100 px-10 py-12 lg:flex lg:w-1/2 lg:flex-col lg:justify-between xl:px-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-24 -z-10 h-80 w-80 rounded-full bg-amber-200/50 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-28 -left-14 -z-10 h-96 w-96 rounded-full bg-sky-200/50 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-1/4 top-1/3 -z-10 h-56 w-56 rounded-full bg-amber-100/40 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
        >
          <ToothIcon className="absolute -left-10 top-10 h-40 w-40 rotate-[-12deg] text-amber-900" />
          <ToothIcon className="absolute right-0 top-1/3 h-56 w-56 rotate-[8deg] text-amber-900" />
          <ToothIcon className="absolute bottom-0 left-1/4 h-44 w-44 rotate-[16deg] text-amber-900" />
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element -- static
            brand asset from /public, not worth next/image's overhead here */}
        <img src="/logo-wordmark.png" alt="ADT Dental Clinic" className="h-11 w-auto" />

        <div className="max-w-md">
          <p className="text-sm font-medium uppercase tracking-wide text-amber-600">
            {heroEyebrow}
          </p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-zinc-900">
            {heroTitle}
          </h1>
          <p className="mt-4 text-base leading-7 text-zinc-600">
            {heroDescription}
          </p>

          {heroHighlights.length > 0 && (
            <ul className="mt-8 space-y-3">
              {heroHighlights.map((highlight) => (
                <li key={highlight} className="flex items-start gap-3 text-sm text-zinc-700">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-3 w-3"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                  {highlight}
                </li>
              ))}
            </ul>
          )}

          <div className="relative mt-10 w-fit rotate-[-2deg] rounded-xl border border-white bg-white/90 px-4 py-3 shadow-lg shadow-amber-900/5 backdrop-blur">
            <div className="flex items-center gap-1 text-amber-400">
              {Array.from({ length: 5 }).map((_, index) => (
                <svg
                  key={index}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L10 14.9l-5.2 2.8 1-5.9L1.5 7.7l5.9-.8L10 1.5Z" />
                </svg>
              ))}
            </div>
            <p className="mt-1 text-xs font-medium text-zinc-700">
              Trusted by growing dental practices
            </p>
          </div>
        </div>

        <p className="text-xs text-zinc-400">
          &copy; {new Date().getFullYear()} Cashflow. Built for modern dental practices.
        </p>
      </section>

      {/* Form panel — also a light pastel wash (not flat zinc-50/black), with
          the form itself lifted onto a white card so it reads as a distinct,
          polished surface rather than sitting directly on the page. */}
      <section className="relative flex flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-white via-amber-50/40 to-sky-50/60 px-6 py-12 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900 sm:px-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 -z-10 h-72 w-72 rounded-full bg-sky-100/60 blur-3xl dark:bg-sky-900/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -left-16 -z-10 h-72 w-72 rounded-full bg-amber-100/60 blur-3xl dark:bg-amber-900/10"
        />

        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center lg:hidden">
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-zinc-200">
              {/* eslint-disable-next-line @next/next/no-img-element -- static
                  brand asset from /public, not worth next/image's overhead here */}
              <img src="/logo-wordmark.png" alt="ADT Dental Clinic" className="h-8 w-auto" />
            </span>
          </div>

          <div className="rounded-2xl border border-white/60 bg-white/90 p-6 shadow-xl shadow-amber-900/5 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/90 sm:p-8">
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}
