import { NextResponse } from "next/server";
import { auth } from "@/auth";

const DASHBOARD_PATH = "/cashflow";
const LOGIN_PATH = "/login";

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const isSignedIn = Boolean(request.auth);

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
    return NextResponse.redirect(loginUrl);
  }

  // Not signed in and already on "/" or "/login" — nothing to do, let it
  // render as-is.
});

export const config = {
  matcher: ["/", "/login", "/cashflow/:path*"],
};
