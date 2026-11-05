import { NextResponse } from "next/server";
import { rawAuth } from "@/auth";

const DASHBOARD_PATH = "/cashflow";
const LOGIN_PATH = "/login";
const CHANGE_PASSWORD_PATH = "/change-password";

export default rawAuth((request) => {
  const { pathname } = request.nextUrl;
  const isSignedIn = Boolean(request.auth);
  const mustChangePassword = Boolean(request.auth?.user?.mustChangePassword);

  // First layer of the "choose your own password first" rule (the server
  // checks again on every page, action and API call; see lib/auth/access.ts).
  // A person who must change their password may only see the Change password
  // page: everything else sends them there. Form actions get a plain refusal.
  if (isSignedIn && mustChangePassword) {
    if (pathname.startsWith(DASHBOARD_PATH)) {
      if (request.method !== "GET" || request.headers.has("next-action")) {
        return new NextResponse("Change your password first.", { status: 403 });
      }
      return NextResponse.redirect(new URL(CHANGE_PASSWORD_PATH, request.url));
    }
    if (pathname === "/" || pathname === LOGIN_PATH) {
      return NextResponse.redirect(new URL(CHANGE_PASSWORD_PATH, request.url));
    }
    return;
  }

  // The Change password page is for signed-in people only.
  if (!isSignedIn && pathname === CHANGE_PASSWORD_PATH) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  // Already signed in and landing on the marketing homepage or the login
  // page — skip straight to the dashboard instead of showing either again.
  if (isSignedIn && (pathname === "/" || pathname === LOGIN_PATH)) {
    return NextResponse.redirect(new URL(DASHBOARD_PATH, request.url));
  }

  // Not signed in and trying to reach a protected route — send to login,
  // remembering where they were headed so it can return them there after.
  if (!isSignedIn && pathname.startsWith(DASHBOARD_PATH)) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("from", pathname);
    // A session cookie is present but no longer valid: the login timed out
    // (or hit the 12-hour limit) while no page was open. Say so on the login
    // page instead of leaving the person wondering.
    const hadSession = request.cookies
      .getAll()
      .some((cookie) => cookie.name.includes("authjs.session-token"));
    if (hadSession) {
      loginUrl.searchParams.set("reason", "expired");
    }
    return NextResponse.redirect(loginUrl);
  }

  // Not signed in and already on "/" or "/login" — nothing to do, let it
  // render as-is.
});

export const config = {
  matcher: ["/", "/login", "/cashflow/:path*", "/change-password"],
};
