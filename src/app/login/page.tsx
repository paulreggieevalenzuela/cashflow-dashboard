import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "@/components/auth/login-form";
import { parseSignOutReason, signOutMessage } from "@/lib/auth/session-policy";

export const metadata: Metadata = {
  title: "Sign in | ADT Dental Clinic",
  description:
    "Sign in to your ADT Dental Clinic account to manage your practice's finances.",
};

/** Only send people back to a page inside the app — never an outside address. */
function safeReturnPath(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  if (path && path.startsWith("/cashflow") && !path.startsWith("//") && !path.includes("\\")) {
    return path;
  }
  return "/cashflow";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const reasonValue = Array.isArray(params.reason) ? params.reason[0] : params.reason;
  const reason = parseSignOutReason(reasonValue);

  return (
    <AuthLayout
      heroTitle="The Financial and Cashflow Management platform built for dental practices"
      heroDescription="Track patient billing, insurance reimbursements, and day-to-day expenses in one place, so you always know where your practice stands."
      heroHighlights={[
        "See real-time cash flow across every chair and provider",
        "Reconcile insurance payouts and patient balances automatically",
        "Give your front-desk and finance teams one shared view",
      ]}
    >
      <LoginForm
        notice={reason ? signOutMessage(reason) : undefined}
        returnTo={safeReturnPath(params.from)}
      />
    </AuthLayout>
  );
}
