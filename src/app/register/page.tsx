import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/auth-layout";

export const metadata: Metadata = {
  title: "Get access | ADT Dental Clinic",
  description: "How to get an ADT Dental Clinic account for your practice.",
};

export default function RegisterPage() {
  return (
    <AuthLayout
      heroTitle="Get your practice's finances in order"
      heroDescription="From same-day treatment revenue to monthly insurance reconciliations, Cashflow keeps every dollar visible so you can plan with confidence."
      heroHighlights={[
        "Role-based access for admins, dentists, and front-desk staff",
        "Connect your existing practice management data",
        "Start forecasting cash flow from day one",
      ]}
    >
      <div>
        <div className="mb-8">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Get access
          </h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Cashflow accounts are created by your clinic&apos;s administrator,
            not by signing up here — that keeps financial data limited to
            people your practice has approved.
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Ask your admin to add you from{" "}
          <span className="font-mono text-xs">Cashflow → Users</span>. They&apos;ll
          set your role (Admin, Dentist, or Staff) and send you a temporary
          password to sign in with.
        </div>

        <p className="mt-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
