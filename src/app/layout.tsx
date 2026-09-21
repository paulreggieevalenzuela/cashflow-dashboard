import type { Metadata } from "next";
import NextTopLoader from "nextjs-toploader";
import { auth } from "@/auth";
import { getUserTheme } from "@/lib/db/user-preferences";
import "./globals.css";

export const metadata: Metadata = {
  title: "ADT Dental Clinic",
  description: "Cashflow application for ADT Dental Clinic",
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
      </body>
    </html>
  );
}
