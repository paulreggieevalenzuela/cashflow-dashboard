import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth/access";
import { AuthLayout } from "@/components/auth/auth-layout";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export const metadata: Metadata = {
  title: "Choose your password | ADT Dental Clinic",
  robots: { index: false },
};

export default async function ChangePasswordPage() {
  const access = await getAccess();

  if (access.status === "anonymous") redirect("/login");
  if (access.status === "revoked") redirect("/session-ended");
  if (access.status === "ok") {
    // Nothing to change here. If the browser still thinks a change is due
    // (an old token), start fresh instead of bouncing between pages.
    redirect(access.tokenSaysMustChange ? "/session-ended" : "/cashflow/profile");
  }

  const name = access.session.user.name ?? "";

  return (
    <AuthLayout
      heroTitle="One quick step before you start"
      heroDescription="Your administrator gave you a temporary password. Choose one only you know, and you can open the system straight away."
      heroHighlights={[
        "Use a few ordinary words together, such as a sentence you will remember",
        "Nobody at the clinic, including admins, will ever ask for it",
        "Signing in on other devices ends when you change it",
      ]}
    >
      <div>
        <div className="mb-8">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {name ? `Welcome, ${name}` : "Welcome"}
          </h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Choose your own password to continue. You can&apos;t open any other page until you do.
          </p>
        </div>
        <ChangePasswordForm forced />
      </div>
    </AuthLayout>
  );
}
