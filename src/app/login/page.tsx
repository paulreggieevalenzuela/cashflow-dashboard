import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in | ADT Dental Clinic",
  description: "Sign in to your ADT Dental Clinic account to manage your practice's finances.",
};

export default function LoginPage() {
  return (
    <AuthLayout
      heroTitle="The cash flow platform built for dental practices"
      heroDescription="Track patient billing, insurance reimbursements, and day-to-day expenses in one place, so you always know where your practice stands."
      heroHighlights={[
        "See real-time cash flow across every chair and provider",
        "Reconcile insurance payouts and patient balances automatically",
        "Give your front-desk and finance teams one shared view",
      ]}
    >
      <LoginForm />
    </AuthLayout>
  );
}
