import type { Metadata, Viewport } from "next";
import NextTopLoader from "nextjs-toploader";
import { auth } from "@/lib/auth/access";
import { getUserTheme } from "@/lib/db/user-preferences";
import { RegisterServiceWorker } from "@/components/pwa/register-service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: "ADT Dental Clinic",
  description: "Financial & Cashflow Management System for ADT Dental Clinic",
  applicationName: "ADT Cashflow",
  // Installed on an iPhone / iPad ("Add to Home Screen"): open full screen
  // with this name under the icon (the icon itself is src/app/apple-icon.png).
  appleWebApp: {
    capable: true,
    title: "ADT Cashflow",
    statusBarStyle: "default",
  },
  // Don't turn amounts or invoice numbers into phone-number links on iOS.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the installed app use the whole screen (notch / home bar); the
  // layout keeps its content inside the safe area (see globals.css).
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Per-user theme (see /cashflow/profile) — read from the DB, not a
  // cookie, so it's consistent across devices rather than drifting per
  // browser. `auth()` is request-deduplicated, so this doesn't add an extra
  // session lookup beyond what pages already do.
  const session = await auth();
  const theme = session?.user ? await getUserTheme(session.user.id) : "light";

  return (
    <html lang="en" className={`h-full antialiased${theme === "dark" ? " dark" : ""}`}>
      <body className="min-h-full flex flex-col">
        {/* Thin top progress bar on every route change (App Router client
            navigations don't trigger a browser loading indicator on their
            own) — amber (gold) to match the app's accent color. No spinner, since
            the bar itself is the signal and a corner spinner would be an
            extra moving element for no added information. */}
        <NextTopLoader
          color="#d97706"
          height={3}
          showSpinner={false}
          shadow="0 0 8px #d97706, 0 0 4px #d97706"
        />
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
