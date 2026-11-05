import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password | ADT Dental Clinic",
  description: "Ask your clinic admin to reset the password for your account.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      heroTitle="We'll help you get back in"
      heroDescription="Your clinic admin checks that it is you and gives you a temporary password, so you can get back to work quickly."
      heroHighlights={[
        "Temporary passwords expire after a few days",
        "You choose your own password when you sign in",
        "Your patient and billing data stays protected",
      ]}
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
