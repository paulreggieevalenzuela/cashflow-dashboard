import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset password | Cashflow",
  description: "Reset the password for your Cashflow account.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      heroTitle="We'll help you get back in"
      heroDescription="Password resets are quick and secure, so you can get back to running your practice's finances without missing a beat."
      heroHighlights={[
        "Reset links expire after a short window for security",
        "Your patient and billing data stays protected",
        "Contact support any time if you need a hand",
      ]}
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
